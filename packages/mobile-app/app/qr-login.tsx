import Feather from "@expo/vector-icons/Feather"
import { useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { StyleSheet, Text, View } from "react-native"

import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  ScreenScroll,
  SectionHeader,
} from "@/components/ui"
import { getAuthClient } from "@/lib/auth-client"
import { getAuthErrorMessage } from "@/lib/auth-errors"
import { assertAuthConfigured } from "@/lib/config"
import { useSession } from "@/providers/session-provider"
import { theme } from "@/theme/tokens"

function getErrorMessage(error: unknown) {
  return getAuthErrorMessage(error, "无法读取二维码登录请求。")
}

type DeviceStatus = "claiming" | "pending" | "approved" | "denied" | "error"

export default function QrLoginScreen() {
  // The QR encodes Better Auth's verification_uri_complete; the scanner passes
  // the extracted user_code (legacy `token` param name kept for compatibility).
  const params = useLocalSearchParams<{ user_code?: string; token?: string }>()
  const userCode = params.user_code ?? params.token
  const { user } = useSession()
  const [status, setStatus] = useState<DeviceStatus>("claiming")
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<"approve" | "deny" | null>(null)
  // The requesting client and the permissions it asks for, read from the
  // server-checked GET /device response (better-auth 1.7+); approval stays
  // disabled until both are known so the user never approves blind.
  const [approvalInfo, setApprovalInfo] = useState<{
    clientId: string
    scope: string
  } | null>(null)

  useEffect(() => {
    if (!userCode) {
      setError("缺少设备登录验证码。")
      setStatus("error")
      return
    }
    let cancelled = false

    // GET /device claims the pending code for THIS (authenticated) session so a
    // subsequent approve is bound to the right user.
    async function claim() {
      try {
        assertAuthConfigured()
        const { data: claimData, error: claimError } = await getAuthClient().device({
          query: { user_code: userCode as string },
        })
        if (cancelled) return
        if (claimError) {
          setError(getErrorMessage(claimError))
          setStatus("error")
          return
        }
        const claimed = claimData as { client_id?: string; scope?: string } | null
        setApprovalInfo(
          claimed?.client_id
            ? { clientId: claimed.client_id, scope: claimed.scope ?? "" }
            : null
        )
        setStatus("pending")
      } catch (nextError) {
        if (!cancelled) {
          setError(getErrorMessage(nextError))
          setStatus("error")
        }
      }
    }

    void claim()
    return () => {
      cancelled = true
    }
  }, [userCode])

  async function handleApprove() {
    if (!userCode) return
    setAction("approve")
    setError(null)
    try {
      assertAuthConfigured()
      const { error: approveError } = await getAuthClient().device.approve({
        userCode,
      })
      if (approveError) {
        setError(getErrorMessage(approveError))
      } else {
        setStatus("approved")
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setAction(null)
    }
  }

  async function handleReject() {
    if (!userCode) return
    setAction("deny")
    setError(null)
    try {
      assertAuthConfigured()
      const { error: denyError } = await getAuthClient().device.deny({
        userCode,
      })
      if (denyError) {
        setError(getErrorMessage(denyError))
      } else {
        setStatus("denied")
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setAction(null)
    }
  }

  return (
    <ScreenScroll bottomPadding={32}>
      <SectionHeader
        eyebrow="Verification"
        title="确认 Web 登录"
        subtitle="确认这次桌面端登录请求是否由你本人发起。请核对验证码与电脑屏幕上显示的一致。"
      />

      {status === "claiming" ? (
        <Card>
          <LoadingBlock label="正在读取登录请求..." />
        </Card>
      ) : status === "error" ? (
        <EmptyState
          icon="shield-off"
          title="无法确认这个登录"
          description={error || "设备登录请求不存在或已经失效。"}
        />
      ) : (
        <Card style={styles.confirmCard}>
          <View style={styles.headline}>
            <View style={styles.headlineIcon}>
              <Feather
                name={
                  status === "approved"
                    ? "check-circle"
                    : status === "denied"
                      ? "x-circle"
                      : "monitor"
                }
                size={22}
                color={theme.colors.primary}
              />
            </View>
            <View style={styles.headlineText}>
              <Text style={styles.title}>
                {status === "pending"
                  ? "桌面端正在等待你的确认"
                  : status === "approved"
                    ? "这次 Web 登录已批准"
                    : "这次 Web 登录已拒绝"}
              </Text>
              <Text style={styles.subtitle}>
                {status === "pending"
                  ? "请核对下方验证码与电脑上显示的一致，再批准登录。"
                  : "如果这是你本人操作，现在可以回到电脑继续使用。"}
              </Text>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <MetaRow label="验证码" value={userCode ?? "-"} />
            <MetaRow
              label="请求方"
              value={approvalInfo?.clientId ?? "读取中..."}
            />
            <MetaRow
              label="权限"
              value={approvalInfo ? approvalInfo.scope || "无" : "读取中..."}
            />
            <MetaRow
              label="当前账号"
              value={user?.name || user?.email || "当前账号"}
            />
            <MetaRow
              label="状态"
              value={
                status === "pending"
                  ? "待确认"
                  : status === "approved"
                    ? "已批准"
                    : "已拒绝"
              }
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {status === "pending" ? (
            <View style={styles.actions}>
              <Button
                label={action === "approve" ? "批准中..." : "批准登录"}
                icon="shield"
                onPress={() => void handleApprove()}
                disabled={action !== null || !approvalInfo}
              />
              <Button
                label={action === "deny" ? "拒绝中..." : "拒绝此次登录"}
                variant="ghost"
                icon="x"
                onPress={() => void handleReject()}
                disabled={action !== null}
              />
            </View>
          ) : null}
        </Card>
      )}
    </ScreenScroll>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  confirmCard: {
    gap: 18,
  },
  headline: {
    flexDirection: "row",
    gap: 14,
  },
  headlineIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headlineText: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMuted,
  },
  metaGrid: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: "hidden",
  },
  metaRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  metaLabel: {
    fontSize: 13,
    color: theme.colors.textSoft,
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: "600",
  },
  actions: {
    gap: 10,
  },
  error: {
    fontSize: 13,
    color: theme.colors.danger,
  },
})
