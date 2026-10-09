import Feather from "@expo/vector-icons/Feather"
import * as DocumentPicker from "expo-document-picker"
import * as ImagePicker from "expo-image-picker"
import { useRouter, type Href } from "expo-router"
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Circle } from "react-native-svg"

import { ApiError, api } from "@/lib/api"
import {
  buildContentBlocksFromDraftText,
  insertMentionIntoDraft,
  normalizeMentionBackspace,
  reconcileDraftMentions,
  type ChatComposerSendPayload,
  type ChatDraftMention,
} from "@/lib/chat-compose"
import { subscribeMentionSelection } from "@/lib/chat-mention-selection"
import { buildChatFilePreviewHref } from "@/lib/chat-rich-content"
import {
  buildReplyPreviewText,
  getEntityDisplayName,
  getMentionableConversationParticipants,
} from "@/lib/chat-data"
import { createId } from "@/lib/ids"
import { theme } from "@/theme/tokens"
import {
  CONVERSATION_KIND,
  fileRefBlock,
  type ChatConversationView,
  type ConversationReplyRef,
} from "@shared"
import type { StoredFileRecordView } from "@shared/schemas"

type AttachmentKind = "image" | "video" | "audio" | "file"
type AttachmentStatus = "uploading" | "uploaded" | "failed"

interface LocalAttachment {
  id: string
  kind: AttachmentKind
  localUri: string
  name: string
  mimeType: string
  webFile?: Blob | File | null
  progress: number
  status: AttachmentStatus
  file?: StoredFileRecordView
  errorMessage?: string
}

const DEFAULT_INPUT_HEIGHT = 22
const ATTACHMENT_ICON_SIZE = 32
const ATTACHMENT_ICON_STROKE = 2.5

function inferAttachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  if (mimeType.startsWith("image/")) return "image"
  return "file"
}

function normalizeContentKindToAttachmentKind(
  contentKind: StoredFileRecordView["contentKind"]
): AttachmentKind {
  return contentKind === "document" ? "file" : contentKind
}

function assetName(kind: AttachmentKind, uri: string) {
  const extension = uri.split(".").pop()?.toLowerCase()
  if (extension) {
    return `${kind}-${Date.now()}.${extension}`
  }

  if (kind === "video") return `video-${Date.now()}.mp4`
  if (kind === "audio") return `voice-${Date.now()}.m4a`
  if (kind === "file") return `file-${Date.now()}`
  return `photo-${Date.now()}.jpg`
}

function attachmentIconName(
  kind: AttachmentKind
): keyof typeof Feather.glyphMap {
  if (kind === "video") return "video"
  if (kind === "audio") return "mic"
  if (kind === "file") return "file-text"
  return "image"
}

function findInsertedMentionTrigger(previousText: string, nextText: string) {
  if (nextText.length !== previousText.length + 1) {
    return null
  }

  let index = 0
  while (
    index < previousText.length &&
    previousText[index] === nextText[index]
  ) {
    index += 1
  }

  if (nextText[index] !== "@") {
    return null
  }

  return previousText.slice(index) === nextText.slice(index + 1) ? index : null
}

function getDraftMeasurementText(text: string) {
  if (text.length === 0) {
    return " "
  }

  return text.endsWith("\n") ? `${text} ` : text
}

function getAttachmentProgress(attachment: LocalAttachment) {
  if (attachment.status === "uploaded" || attachment.status === "failed") {
    return 1
  }

  return Math.max(0.08, attachment.progress)
}

function AttachmentProgressIcon({
  attachment,
}: {
  attachment: LocalAttachment
}) {
  const center = ATTACHMENT_ICON_SIZE / 2
  const radius = center - ATTACHMENT_ICON_STROKE - 1
  const circumference = 2 * Math.PI * radius
  const progress = getAttachmentProgress(attachment)
  const strokeColor =
    attachment.status === "failed"
      ? theme.colors.danger
      : attachment.status === "uploaded"
        ? theme.colors.success
        : theme.colors.primary

  return (
    <View style={styles.attachmentStatusIcon}>
      <Svg
        width={ATTACHMENT_ICON_SIZE}
        height={ATTACHMENT_ICON_SIZE}
        style={styles.attachmentStatusSvg}
      >
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.colors.border}
          strokeWidth={ATTACHMENT_ICON_STROKE}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={strokeColor}
          strokeWidth={ATTACHMENT_ICON_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          fill="none"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <Feather
        name={attachmentIconName(attachment.kind)}
        size={14}
        color={strokeColor}
      />
    </View>
  )
}

function AttachmentRow({
  attachment,
  accessory,
  onPress,
}: {
  attachment: LocalAttachment
  accessory: ReactNode
  onPress?: () => void
}) {
  const content = (
    <View style={styles.attachmentRow}>
      <AttachmentProgressIcon attachment={attachment} />
      <Text
        numberOfLines={1}
        style={[
          styles.attachmentRowLabel,
          attachment.status === "failed" && styles.attachmentRowLabelFailed,
        ]}
      >
        {attachment.name}
      </Text>
      {accessory}
    </View>
  )

  if (!onPress) {
    return content
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.attachmentRowPressed]}
    >
      {content}
    </Pressable>
  )
}

function AttachmentListSheet({
  open,
  attachments,
  onClose,
  onRemove,
  onPreview,
}: {
  open: boolean
  attachments: LocalAttachment[]
  onClose: () => void
  onRemove: (attachmentId: string) => void
  onPreview: (attachment: LocalAttachment) => void
}) {
  const insets = useSafeAreaInsets()

  return (
    <Modal
      animationType="slide"
      transparent
      visible={open}
      onRequestClose={onClose}
    >
      <View style={styles.attachmentSheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.attachmentSheet,
            {
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <View style={styles.attachmentSheetHandle} />
          <Text style={styles.attachmentSheetTitle}>待发送文件</Text>
          <ScrollView
            style={styles.attachmentSheetScroll}
            contentContainerStyle={styles.attachmentSheetContent}
          >
            {attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.id}
                attachment={attachment}
                onPress={() => onPreview(attachment)}
                accessory={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`移除 ${attachment.name}`}
                    onPress={(event) => {
                      event.stopPropagation()
                      onRemove(attachment.id)
                    }}
                    style={styles.attachmentRowClose}
                  >
                    <Feather
                      name="x"
                      size={16}
                      color={theme.colors.textMuted}
                    />
                  </Pressable>
                }
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

export function ChatComposer({
  workspaceId,
  conversationId,
  conversation,
  viewerParticipantId,
  disabled,
  replyTo,
  onCancelReply,
  onSend,
  onTyping,
}: {
  workspaceId: string
  conversationId: string
  conversation: ChatConversationView
  viewerParticipantId?: string
  disabled?: boolean
  replyTo?: ConversationReplyRef | null
  onCancelReply?: () => void
  onSend: (payload: ChatComposerSendPayload) => Promise<void>
  /** Best-effort callback fired on every keystroke; consumer debounces. */
  onTyping?: () => void
}) {
  const router = useRouter()
  const { height: windowHeight } = useWindowDimensions()
  const [draftText, setDraftText] = useState("")
  const [draftMentions, setDraftMentions] = useState<ChatDraftMention[]>([])
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [inputHeight, setInputHeight] = useState(DEFAULT_INPUT_HEIGHT)
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder)
  const draftTextRef = useRef(draftText)
  const draftMentionsRef = useRef(draftMentions)
  const selectionRef = useRef(selection)
  const attachmentsRef = useRef(attachments)
  const uploadControllersRef = useRef(new Map<string, AbortController>())
  const pendingMentionInsertIndexRef = useRef<number | null>(null)
  const maxInputHeight = Math.max(120, Math.floor(windowHeight * 0.4))
  const mentionsEnabled = conversation.kind !== CONVERSATION_KIND.DIRECT

  const mentionCandidates = useMemo(
    () =>
      getMentionableConversationParticipants(conversation, viewerParticipantId),
    [conversation, viewerParticipantId]
  )

  const draftBlocks = useMemo(
    () => buildContentBlocksFromDraftText(draftText, draftMentions),
    [draftMentions, draftText]
  )

  const uploadedAttachments = useMemo(
    () =>
      attachments.filter(
        (
          attachment
        ): attachment is LocalAttachment & { file: StoredFileRecordView } =>
          attachment.status === "uploaded" && Boolean(attachment.file)
      ),
    [attachments]
  )

  const hasPendingAttachmentWork = attachments.some(
    (attachment) => attachment.status !== "uploaded"
  )

  useEffect(() => {
    draftTextRef.current = draftText
  }, [draftText])

  useEffect(() => {
    draftMentionsRef.current = draftMentions
  }, [draftMentions])

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    // 录音状态变化不应取消附件，上传只在组件卸载时统一清理。
    const uploadControllers = uploadControllersRef.current
    return () => {
      uploadControllers.forEach((controller) => controller.abort())
      uploadControllers.clear()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (recorderState.isRecording) {
        void recorder.stop().catch(() => undefined)
      }
    }
  }, [recorder, recorderState.isRecording])

  useEffect(() => {
    return subscribeMentionSelection(conversationId, (mention) => {
      const insertIndex = pendingMentionInsertIndexRef.current
      pendingMentionInsertIndexRef.current = null
      if (insertIndex === null) {
        return
      }

      const inserted = insertMentionIntoDraft(
        draftTextRef.current,
        draftMentionsRef.current,
        mention,
        insertIndex
      )
      setDraftText(inserted.text)
      setDraftMentions(inserted.mentions)
      setSelection({
        start: inserted.selection,
        end: inserted.selection,
      })
    })
  }, [conversationId])

  function openMentionPicker() {
    if (
      !mentionsEnabled ||
      disabled ||
      sending ||
      mentionCandidates.length === 0
    ) {
      return false
    }

    router.push(
      `/chat/mention?conversationId=${encodeURIComponent(conversationId)}` as Href
    )
    return true
  }

  function updateAttachment(
    attachmentId: string,
    updater: (attachment: LocalAttachment) => LocalAttachment
  ) {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId ? updater(attachment) : attachment
      )
    )
  }

  function beginAttachmentUpload(
    attachmentInput: Omit<
      LocalAttachment,
      "progress" | "status" | "file" | "errorMessage"
    >
  ) {
    const attachment: LocalAttachment = {
      ...attachmentInput,
      progress: 0.04,
      status: "uploading",
    }

    const controller = new AbortController()
    uploadControllersRef.current.set(attachment.id, controller)

    setAttachments((current) => [...current, attachment])

    void api
      .uploadAsset(
        workspaceId,
        {
          uri: attachment.localUri,
          name: attachment.name,
          mimeType: attachment.mimeType,
          file: attachment.webFile,
        },
        {
          signal: controller.signal,
          onProgress: (progress) => {
            updateAttachment(attachment.id, (current) => ({
              ...current,
              progress: Math.max(current.progress, progress),
            }))
          },
        }
      )
      .then((file) => {
        uploadControllersRef.current.delete(attachment.id)
        updateAttachment(attachment.id, (current) => ({
          ...current,
          kind: normalizeContentKindToAttachmentKind(file.contentKind),
          name: file.originalName,
          mimeType: file.mimeType,
          progress: 1,
          status: "uploaded",
          file,
          errorMessage: undefined,
        }))
      })
      .catch((error) => {
        uploadControllersRef.current.delete(attachment.id)
        if (error instanceof ApiError && error.code === "ABORTED") {
          return
        }

        updateAttachment(attachment.id, (current) => ({
          ...current,
          progress: 1,
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "上传失败，请移除后重试",
        }))
      })
  }

  function queueAttachments(
    nextAttachments: Array<{
      kind: AttachmentKind
      uri: string
      name: string
      mimeType: string
      webFile?: Blob | File | null
    }>
  ) {
    nextAttachments.forEach((attachment) => {
      beginAttachmentUpload({
        id: createId("attachment"),
        kind: attachment.kind,
        localUri: attachment.uri,
        name: attachment.name,
        mimeType: attachment.mimeType,
        webFile: attachment.webFile,
      })
    })
  }

  async function pickLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert("无法访问相册", "请先授权照片和视频访问权限。")
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.9,
      selectionLimit: 6,
    })

    if (result.canceled) return

    setMenuVisible(false)
    queueAttachments(
      result.assets.map((asset) => {
        const mimeType =
          asset.mimeType ||
          (asset.type === "video" ? "video/mp4" : "image/jpeg")
        const kind = inferAttachmentKind(mimeType)
        return {
          kind,
          uri: asset.uri,
          name: asset.fileName || assetName(kind, asset.uri),
          mimeType,
          webFile: asset.file,
        }
      })
    )
  }

  async function launchCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert("无法使用相机", "请先授权相机权限。")
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.85,
    })

    if (result.canceled || result.assets.length === 0) return

    const asset = result.assets[0]!
    const mimeType =
      asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg")
    const kind = inferAttachmentKind(mimeType)

    setMenuVisible(false)
    queueAttachments([
      {
        kind,
        uri: asset.uri,
        name: asset.fileName || assetName(kind, asset.uri),
        mimeType,
        webFile: asset.file,
      },
    ])
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    })

    if (result.canceled) return

    setMenuVisible(false)
    queueAttachments(
      result.assets.map((asset) => {
        const mimeType = asset.mimeType || "application/octet-stream"
        const kind = inferAttachmentKind(mimeType)
        return {
          kind,
          uri: asset.uri,
          name: asset.name || assetName(kind, asset.uri),
          mimeType,
          webFile: asset.file,
        }
      })
    )
  }

  async function toggleRecording() {
    setMenuVisible(false)

    if (recorderState.isRecording) {
      await recorder.stop()
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "duckOthers",
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      })
      const uri = recorder.getStatus().url || recorderState.url
      if (!uri) return

      queueAttachments([
        {
          kind: "audio",
          uri,
          name: assetName("audio", uri),
          mimeType: "audio/mp4",
        },
      ])
      return
    }

    const permission = await requestRecordingPermissionsAsync()
    if (!permission.granted) {
      Alert.alert("无法录音", "请先授权麦克风权限。")
      return
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    })

    await recorder.prepareToRecordAsync()
    recorder.record()
  }

  async function handleSend() {
    if (draftBlocks.length === 0 && uploadedAttachments.length === 0) {
      return
    }

    if (hasPendingAttachmentWork) {
      return
    }

    setMenuVisible(false)
    setSending(true)

    try {
      await onSend({
        contentBlocks: [
          ...draftBlocks,
          ...uploadedAttachments.map((attachment) =>
            fileRefBlock({
              sha256: attachment.file.sha256,
              mimeType: attachment.file.mimeType,
              name: attachment.file.originalName,
              sizeBytes: attachment.file.sizeBytes,
              category: attachment.file.contentKind,
            })
          ),
        ],
        replyToItemId: replyTo?.itemId,
        replyTo: replyTo ?? undefined,
      })
      setDraftText("")
      setDraftMentions([])
      setSelection({ start: 0, end: 0 })
      setInputHeight(DEFAULT_INPUT_HEIGHT)
      setAttachments([])
      setAttachmentSheetOpen(false)
      onCancelReply?.()
    } finally {
      setSending(false)
    }
  }

  function handleChangeText(nextText: string) {
    const previousText = draftTextRef.current
    const normalizedDeletion = normalizeMentionBackspace(
      previousText,
      nextText,
      draftMentionsRef.current,
      selectionRef.current
    )

    if (normalizedDeletion) {
      setDraftText(normalizedDeletion.text)
      setDraftMentions(normalizedDeletion.mentions)
      if (normalizedDeletion.text.length === 0) {
        setInputHeight(DEFAULT_INPUT_HEIGHT)
      }
      setSelection({
        start: normalizedDeletion.selection,
        end: normalizedDeletion.selection,
      })
      return
    }

    const nextMentions = reconcileDraftMentions(
      previousText,
      nextText,
      draftMentionsRef.current
    )

    setDraftText(nextText)
    setDraftMentions(nextMentions)
    if (nextText.length === 0) {
      setInputHeight(DEFAULT_INPUT_HEIGHT)
    }
    onTyping?.()

    const mentionTriggerIndex = findInsertedMentionTrigger(
      previousText,
      nextText
    )
    if (
      mentionsEnabled &&
      mentionTriggerIndex !== null &&
      !nextMentions.some(
        (mention) =>
          mentionTriggerIndex >= mention.start &&
          mentionTriggerIndex < mention.end
      )
    ) {
      pendingMentionInsertIndexRef.current = mentionTriggerIndex
      if (!openMentionPicker()) {
        pendingMentionInsertIndexRef.current = null
      }
    }
  }

  function removeAttachment(attachmentId: string) {
    const controller = uploadControllersRef.current.get(attachmentId)
    if (controller) {
      controller.abort()
      uploadControllersRef.current.delete(attachmentId)
    }

    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId)
    )

    if (attachmentsRef.current.length <= 2) {
      setAttachmentSheetOpen(false)
    }
  }

  function openAttachmentPreview(attachment: LocalAttachment) {
    const previewCategory =
      attachment.file?.contentKind ??
      (attachment.kind === "file" ? "document" : attachment.kind)
    const previewName = attachment.file?.originalName ?? attachment.name
    const previewMimeType = attachment.file?.mimeType ?? attachment.mimeType

    if (attachment.file?.url) {
      router.push(
        buildChatFilePreviewHref({
          uri: attachment.file.url,
          mimeType: previewMimeType,
          name: previewName,
          category: previewCategory,
          source: "remote",
        })
      )
      return
    }

    if (!attachment.localUri) {
      return
    }

    if (attachment.kind === "file" && Platform.OS !== "web") {
      Alert.alert("文件上传完成后可预览", "文档类附件会在上传成功后打开预览。")
      return
    }

    router.push(
      buildChatFilePreviewHref({
        uri: attachment.localUri,
        mimeType: previewMimeType,
        name: previewName,
        category: previewCategory,
        source: "local",
      })
    )
  }

  const sendDisabled =
    disabled ||
    sending ||
    hasPendingAttachmentWork ||
    (draftBlocks.length === 0 && uploadedAttachments.length === 0)

  const primaryAttachment = attachments[0]

  return (
    <View style={styles.wrap}>
      {replyTo ? (
        <View style={styles.replyBar}>
          <Feather
            name="corner-up-left"
            size={15}
            color={theme.colors.primary}
          />
          <Text numberOfLines={1} style={styles.replyBarText}>
            {`${getEntityDisplayName(replyTo.author)}: ${buildReplyPreviewText(replyTo)}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="取消引用"
            onPress={onCancelReply}
            style={styles.replyBarClose}
          >
            <Feather name="x" size={16} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {primaryAttachment ? (
        <AttachmentRow
          attachment={primaryAttachment}
          onPress={
            attachments.length > 1
              ? () => {
                  setMenuVisible(false)
                  setAttachmentSheetOpen(true)
                }
              : () => openAttachmentPreview(primaryAttachment)
          }
          accessory={
            attachments.length > 1 ? (
              <View style={styles.attachmentSummaryAccessory}>
                <Text style={styles.attachmentSummaryCount}>
                  {attachments.length}
                </Text>
                <Feather
                  name="chevron-down"
                  size={16}
                  color={theme.colors.textMuted}
                />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`移除 ${primaryAttachment.name}`}
                onPress={(event) => {
                  event.stopPropagation()
                  removeAttachment(primaryAttachment.id)
                }}
                style={styles.attachmentRowClose}
              >
                <Feather name="x" size={16} color={theme.colors.textMuted} />
              </Pressable>
            )
          }
        />
      ) : null}

      {recorderState.isRecording ? (
        <Text style={styles.recordingHint}>录音中，再点一次麦克风结束</Text>
      ) : null}

      <View style={styles.composerShell}>
        <RoundAction
          icon={recorderState.isRecording ? "square" : "mic"}
          onPress={() => void toggleRecording()}
          disabled={disabled || sending}
          active={recorderState.isRecording}
        />

        <View style={styles.inputShell}>
          <View pointerEvents="none" style={styles.textMeasureLayer}>
            <Text
              onLayout={(event) => {
                setInputHeight(
                  Math.max(
                    DEFAULT_INPUT_HEIGHT,
                    Math.min(
                      maxInputHeight,
                      Math.ceil(event.nativeEvent.layout.height)
                    )
                  )
                )
              }}
              style={styles.textMeasure}
            >
              {getDraftMeasurementText(draftText)}
            </Text>
          </View>
          <TextInput
            value={draftText}
            selection={selection}
            onChangeText={handleChangeText}
            onFocus={() => {
              setMenuVisible(false)
              setAttachmentSheetOpen(false)
            }}
            onSelectionChange={(event) => {
              setSelection(event.nativeEvent.selection)
              selectionRef.current = event.nativeEvent.selection
            }}
            onContentSizeChange={(event) => {
              setInputHeight(
                Math.max(
                  DEFAULT_INPUT_HEIGHT,
                  Math.min(
                    maxInputHeight,
                    Math.ceil(event.nativeEvent.contentSize.height)
                  )
                )
              )
            }}
            placeholder="发消息"
            placeholderTextColor={theme.colors.textSoft}
            multiline
            scrollEnabled={inputHeight >= maxInputHeight}
            style={[
              styles.textInput,
              {
                height: inputHeight,
                maxHeight: maxInputHeight,
              },
            ]}
            textAlignVertical="top"
            editable={!disabled && !sending}
          />
        </View>

        <RoundAction
          icon="plus"
          onPress={() => {
            setAttachmentSheetOpen(false)
            setMenuVisible((current) => !current)
          }}
          disabled={disabled || sending}
          active={menuVisible}
        />

        <RoundAction
          icon="send"
          onPress={() => void handleSend()}
          disabled={sendDisabled}
          active={!sendDisabled}
        />
      </View>

      {menuVisible ? (
        <View style={styles.quickMenu}>
          <MenuAction
            icon="image"
            label="相册"
            onPress={() => void pickLibrary()}
          />
          <MenuAction
            icon="camera"
            label="拍照"
            onPress={() => void launchCamera()}
          />
          <MenuAction
            icon="paperclip"
            label="文件"
            onPress={() => void pickDocument()}
          />
        </View>
      ) : null}

      {sending ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      ) : null}

      <AttachmentListSheet
        open={attachmentSheetOpen ? attachments.length > 1 : false}
        attachments={attachments}
        onClose={() => setAttachmentSheetOpen(false)}
        onRemove={removeAttachment}
        onPreview={openAttachmentPreview}
      />
    </View>
  )
}

function RoundAction({
  icon,
  onPress,
  disabled,
  active,
}: {
  icon: keyof typeof Feather.glyphMap
  onPress: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.roundAction,
        active && styles.roundActionActive,
        disabled && styles.roundActionDisabled,
        pressed && !disabled && styles.roundActionPressed,
      ]}
    >
      <Feather
        name={icon}
        size={18}
        color={active ? theme.colors.white : theme.colors.text}
      />
    </Pressable>
  )
}

function MenuAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap
  label: string
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuAction}>
      <View style={styles.menuIcon}>
        <Feather name={icon} size={18} color={theme.colors.text} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  replyBar: {
    minHeight: 36,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  replyBarText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  replyBarClose: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentStatusIcon: {
    width: ATTACHMENT_ICON_SIZE,
    height: ATTACHMENT_ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentStatusSvg: {
    position: "absolute",
  },
  attachmentRow: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingLeft: 10,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  attachmentRowPressed: {
    opacity: 0.78,
  },
  attachmentRowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text,
    fontWeight: "600",
  },
  attachmentRowLabelFailed: {
    color: theme.colors.danger,
  },
  attachmentRowClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentSummaryAccessory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 6,
  },
  attachmentSummaryCount: {
    minWidth: 18,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textAlign: "right",
  },
  attachmentSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.14)",
    justifyContent: "flex-end",
  },
  attachmentSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: theme.colors.surface,
    paddingTop: 10,
    paddingHorizontal: 14,
    gap: 12,
  },
  attachmentSheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.borderStrong,
  },
  attachmentSheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  attachmentSheetScroll: {
    maxHeight: 280,
  },
  attachmentSheetContent: {
    gap: 8,
    paddingBottom: 4,
  },
  recordingHint: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.primary,
    fontWeight: "700",
  },
  composerShell: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  roundAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  roundActionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  roundActionDisabled: {
    opacity: 0.45,
  },
  roundActionPressed: {
    opacity: 0.7,
  },
  inputShell: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 5,
    justifyContent: "center",
  },
  textMeasureLayer: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 5,
    opacity: 0,
  },
  textInput: {
    minHeight: DEFAULT_INPUT_HEIGHT,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.text,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  textMeasure: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.text,
  },
  quickMenu: {
    flexDirection: "row",
    gap: 10,
  },
  menuAction: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 8,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.backgroundAlt,
  },
  menuLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
  loadingOverlay: {
    position: "absolute",
    top: 10,
    right: 16,
  },
})
