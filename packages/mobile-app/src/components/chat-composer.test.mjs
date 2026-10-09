import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import React from "react"
import { act, create } from "react-test-renderer"

const require = createRequire(import.meta.url)
const directory = dirname(fileURLToPath(import.meta.url))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Keep the actual component and React effects; replace only native UI and I/O.
const mocks = {
  "@expo/vector-icons/Feather": 'export default "Feather"',
  "expo-document-picker": `export const getDocumentAsync = async () => ({ canceled: false, assets: [{ uri: "file:pending.txt", name: "pending.txt", mimeType: "text/plain" }] })`,
  "expo-image-picker": `export const requestMediaLibraryPermissionsAsync = async () => ({ granted: true }); export const launchImageLibraryAsync = async () => ({ canceled: true }); export const requestCameraPermissionsAsync = requestMediaLibraryPermissionsAsync; export const launchCameraAsync = launchImageLibraryAsync`,
  "expo-router": "export const useRouter = () => ({ push() {} })",
  "expo-audio": `import { useSyncExternalStore } from "react";
    export const RecordingPresets = { HIGH_QUALITY: {} };
    export const requestRecordingPermissionsAsync = async () => ({ granted: true });
    export const setAudioModeAsync = async () => {};
    export const useAudioRecorder = () => environment.recorder;
    export const useAudioRecorderState = () => useSyncExternalStore(environment.subscribe, environment.getSnapshot)`,
  "react-native": `export const View = "View", Text = "Text", TextInput = "TextInput", Pressable = "Pressable", ScrollView = "ScrollView", ActivityIndicator = "ActivityIndicator";
    export const Modal = ({ visible, children }) => visible ? children : null;
    export const Platform = { OS: "web" }, StyleSheet = { create: value => value, absoluteFill: {} }, Alert = { alert() {} };
    export const useWindowDimensions = () => ({ width: 400, height: 800 })`,
  "react-native-safe-area-context":
    "export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 })",
  "react-native-svg": 'export default "Svg"; export const Circle = "Circle"',
  "@/lib/api":
    "export const ApiError = environment.ApiError; export const api = { uploadAsset: environment.uploadAsset }",
  "@/lib/chat-compose": `export const buildContentBlocksFromDraftText = text => text ? [{ type: "text", text }] : [];
    export const insertMentionIntoDraft = () => ({ text: "", mentions: [], selection: 0 });
    export const normalizeMentionBackspace = (_previous, text) => ({ text, mentions: [], selection: text.length });
    export const reconcileDraftMentions = () => []`,
  "@/lib/chat-mention-selection":
    "export const subscribeMentionSelection = () => () => {}",
  "@/lib/chat-rich-content":
    'export const buildChatFilePreviewHref = () => "/preview"',
  "@/lib/chat-data":
    'export const buildReplyPreviewText = () => ""; export const getEntityDisplayName = () => ""; export const getMentionableConversationParticipants = () => []',
  "@/lib/ids": "let id = 0; export const createId = () => String(++id)",
  "@/theme/tokens":
    'export const theme = { colors: new Proxy({}, { get: () => "#000" }) }',
  "@shared":
    'export const CONVERSATION_KIND = { DIRECT: "direct" }; export const fileRefBlock = value => ({ type: "file_ref", ...value })',
}

const bundle = await build({
  entryPoints: [resolve(directory, "chat-composer.tsx")],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
  plugins: [
    {
      name: "composer-test-boundaries",
      setup(builder) {
        builder.onResolve(
          { filter: /^(?:@expo\/|expo-|react-native|@\/|@shared)/ },
          ({ path }) => ({ path, namespace: "mock" })
        )
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => {
          assert.ok(path in mocks, `Unexpected component dependency: ${path}`)
          return { contents: mocks[path], loader: "js" }
        })
      },
    },
  ],
})

function createEnvironment() {
  let snapshot = { isRecording: false, url: null }
  const listeners = new Set()
  const uploads = []
  const sent = []
  const setRecording = (isRecording) => {
    if (snapshot.isRecording === isRecording) return
    snapshot = { isRecording, url: isRecording ? null : "file:recording.m4a" }
    listeners.forEach((listener) => listener())
  }
  class ApiError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  }
  const environment = {
    ApiError,
    uploads,
    sent,
    stopCalls: 0,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    recorder: {
      prepareToRecordAsync: async () => {},
      record: () => setRecording(true),
      stop: async () => {
        environment.stopCalls += 1
        setRecording(false)
      },
      getStatus: () => ({ url: "file:recording.m4a" }),
    },
    uploadAsset(_workspaceId, asset, { signal }) {
      return new Promise((resolveUpload, rejectUpload) => {
        const upload = {
          asset,
          signal,
          complete() {
            resolveUpload({
              sha256: "a".repeat(64),
              originalName: asset.name,
              mimeType: asset.mimeType,
              sizeBytes: 10,
              contentKind: asset.mimeType.startsWith("audio/")
                ? "audio"
                : "document",
            })
          },
        }
        signal.addEventListener(
          "abort",
          () => rejectUpload(new ApiError("Upload aborted", "ABORTED")),
          { once: true }
        )
        uploads.push(upload)
      })
    },
  }
  return environment
}

async function mountComposer(t) {
  const environment = createEnvironment()
  const module = { exports: {} }
  new Function(
    "require",
    "module",
    "exports",
    "environment",
    bundle.outputFiles[0].text
  )(require, module, module.exports, environment)
  let renderer
  await act(async () => {
    renderer = create(
      React.createElement(module.exports.ChatComposer, {
        workspaceId: "workspace",
        conversationId: "conversation",
        conversation: { id: "conversation", kind: "direct" },
        onSend: async (payload) => {
          environment.sent.push(payload)
        },
      })
    )
  })
  t.after(async () => {
    await act(async () => renderer.unmount())
  })
  return { renderer, environment }
}

function action(renderer, icon) {
  const button = renderer.root
    .findAllByType("Pressable")
    .find((element) =>
      element
        .findAllByType("Feather")
        .some((feather) => feather.props.name === icon)
    )
  assert.ok(button, `Missing ${icon} action`)
  return button
}

async function attachFile(renderer) {
  await act(async () => action(renderer, "plus").props.onPress())
  await act(async () => action(renderer, "paperclip").props.onPress())
}

test("recording transitions keep pending attachments uploadable and sendable", async (t) => {
  const { renderer, environment } = await mountComposer(t)
  await attachFile(renderer)
  const fileUpload = environment.uploads[0]
  assert.ok(fileUpload)
  assert.equal(fileUpload.signal.aborted, false)

  await act(async () => action(renderer, "mic").props.onPress())
  assert.equal(environment.getSnapshot().isRecording, true)
  assert.equal(
    fileUpload.signal.aborted,
    false,
    "starting recording must not cancel an attachment"
  )

  await act(async () => action(renderer, "square").props.onPress())
  assert.equal(environment.getSnapshot().isRecording, false)
  assert.equal(environment.uploads.length, 2)
  assert.equal(
    fileUpload.signal.aborted,
    false,
    "stopping recording must not cancel an attachment"
  )
  await act(async () =>
    environment.uploads.forEach((upload) => upload.complete())
  )
  assert.equal(action(renderer, "send").props.disabled, false)
  await act(async () => action(renderer, "send").props.onPress())
  assert.equal(environment.sent.length, 1)
  const files = environment.sent[0].contentBlocks.filter(
    (block) => block.type === "file_ref"
  )
  assert.equal(files.length, 2)
  assert.equal(files[0].name, "pending.txt")
})

test("removing an attachment still aborts its upload", async (t) => {
  const { renderer, environment } = await mountComposer(t)
  await attachFile(renderer)
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "移除 pending.txt" })
      .props.onPress({ stopPropagation() {} })
  )
  assert.equal(environment.uploads[0].signal.aborted, true)
  assert.equal(
    renderer.root.findAllByProps({ accessibilityLabel: "移除 pending.txt" })
      .length,
    0
  )
})

test("unmounting still aborts pending uploads", async (t) => {
  const { renderer, environment } = await mountComposer(t)
  await attachFile(renderer)
  assert.equal(environment.uploads[0].signal.aborted, false)
  await act(async () => renderer.unmount())
  assert.equal(environment.uploads[0].signal.aborted, true)
})

test("unmounting still stops active recording", async (t) => {
  const { renderer, environment } = await mountComposer(t)
  await act(async () => action(renderer, "mic").props.onPress())
  assert.equal(environment.getSnapshot().isRecording, true)
  const previousStops = environment.stopCalls
  await act(async () => renderer.unmount())
  assert.equal(environment.getSnapshot().isRecording, false)
  assert.equal(environment.stopCalls, previousStops + 1)
})
