"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";

const TOKEN_KEY = "dev-alram.jwt";
const API_BASE = "";
const BACKEND_LABEL = "BACKEND_BASE_URL";
const FIREBASE_VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
};

const repeatTypes = [
  { value: "ONCE", label: "1회" },
  { value: "DAILY", label: "매일" },
  { value: "WEEKLY", label: "매주" },
  { value: "DAYS", label: "요일" },
];

const dayOptions = [
  { value: "MON", label: "월" },
  { value: "TUE", label: "화" },
  { value: "WED", label: "수" },
  { value: "THU", label: "목" },
  { value: "FRI", label: "금" },
  { value: "SAT", label: "토" },
  { value: "SUN", label: "일" },
];

const emptyAuth = {
  username: "",
  email: "",
  password: "",
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function defaultSendAt() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return toLocalInputValue(date);
}

function normalizeSendAt(value) {
  if (!value) return null;
  const cleanValue = value.split(".")[0];
  return cleanValue.length === 16 ? `${cleanValue}:00` : cleanValue;
}

function isFutureSendAt(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function toInputDateTime(value) {
  if (!value) return "";
  return value.slice(0, 19);
}

function displayDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status) {
  const labels = {
    PENDING: "대기",
    SENT: "전송",
    FAILED: "실패",
  };
  return labels[status] || status || "-";
}

function statusTone(status) {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  return "pending";
}

function buildCreateForm() {
  return {
    title: "",
    body: "",
    sendAt: defaultSendAt(),
    repeatType: "ONCE",
    repeatDays: [],
  };
}

function getMissingFirebaseKeys() {
  return [
    ["NEXT_PUBLIC_FIREBASE_API_KEY", firebaseConfig.apiKey],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", firebaseConfig.projectId],
    [
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      firebaseConfig.messagingSenderId,
    ],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", firebaseConfig.appId],
    ["NEXT_PUBLIC_FIREBASE_VAPID_KEY", FIREBASE_VAPID_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function normalizeTokenValue(value) {
  return String(value || "").replace(/^Bearer\s+/i, "").trim();
}

function buildBearerToken(value) {
  const cleanToken = normalizeTokenValue(value);
  return cleanToken ? `Bearer ${cleanToken}` : "";
}

function getAuthTokenFromResponse(data) {
  return (
    data?.token ||
    data?.accessToken ||
    data?.jwt ||
    data?.data?.token ||
    data?.data?.accessToken ||
    ""
  );
}

function getApiErrorMessage(data, status, path) {
  const fallbackMessage =
    path === "/api/auth/login" && [401, 403].includes(status)
      ? "이메일 또는 비밀번호가 다릅니다."
      : `HTTP ${status}`;

  if (!data) return fallbackMessage;
  if (typeof data === "string") return data || fallbackMessage;

  const message =
    data.message ||
    data.errorMessage ||
    data.error ||
    data.detail ||
    data.reason ||
    data.data?.message ||
    data.data?.errorMessage ||
    data.data?.error;

  if (Array.isArray(message)) return message.join(", ");
  if (message) return String(message);

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors
      .map((error) =>
        typeof error === "string"
          ? error
          : error.message || error.defaultMessage || error.reason || "",
      )
      .filter(Boolean)
      .join(", ");
  }

  return fallbackMessage;
}

export default function Home() {
  const [token, setToken] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(emptyAuth);
  const [authBusy, setAuthBusy] = useState(false);
  const [form, setForm] = useState(buildCreateForm);
  const [deviceToken, setDeviceToken] = useState("");
  const [platform, setPlatform] = useState("WEB");
  const [informs, setInforms] = useState([]);
  const [pageInfo, setPageInfo] = useState({
    number: 0,
    size: 10,
    totalPages: 0,
    totalElements: 0,
  });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [busyAction, setBusyAction] = useState("");

  const isAuthed = Boolean(token);

  const request = useCallback(
    async (path, options = {}) => {
      const { method = "GET", body, auth = true } = options;
      const headers = {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      };

      if (auth) {
        const authToken =
          token ||
          (typeof window !== "undefined"
            ? localStorage.getItem(TOKEN_KEY)
            : "");
        const bearerToken = buildBearerToken(authToken);
        if (bearerToken) headers.Authorization = bearerToken;
      }

      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await response.text();
      let data = null;

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok) {
        const message = getApiErrorMessage(data, response.status, path);
        console.error("API request failed", {
          path,
          status: response.status,
          message,
          response: data,
        });
        throw new Error(message);
      }

      return data;
    },
    [token],
  );

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadInforms = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    try {
      const data = await request(
        `/api/informs?page=${page}&size=${pageInfo.size}&sort=sendAt,desc`,
      );
      const content = data?.content || [];
      const contentWithFailReasons = await Promise.all(
        content.map(async (inform) => {
          if (inform.status !== "FAILED") return inform;

          try {
            const detail = await request(`/api/informs/${inform.id}`);
            return { ...inform, ...detail };
          } catch {
            return inform;
          }
        }),
      );

      setInforms(contentWithFailReasons);
      setPageInfo({
        number: data?.number ?? page,
        size: data?.size ?? pageInfo.size,
        totalPages: data?.totalPages ?? 0,
        totalElements: data?.totalElements ?? 0,
      });
    } catch (error) {
      showToast("error", error.message);
      if (/401|403|Unauthorized|Forbidden/i.test(error.message)) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageInfo.size, request, showToast, token]);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) setToken(savedToken);
  }, []);

  useEffect(() => {
    if (token) loadInforms();
  }, [loadInforms, token]);

  const createPayload = useMemo(() => {
    const repeatDays =
      form.repeatType === "DAYS" && form.repeatDays.length > 0
        ? form.repeatDays.join(",")
        : null;

    return {
      title: form.title.trim(),
      body: form.body.trim(),
      sendAt: normalizeSendAt(form.sendAt),
      repeatType: form.repeatType,
      repeatDays,
    };
  }, [form]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthBusy(true);

    try {
      if (authMode === "signup") {
        await request("/api/auth/signup", {
          method: "POST",
          auth: false,
          body: {
            username: authForm.username.trim(),
            email: authForm.email.trim(),
            password: authForm.password,
          },
        });
        setAuthMode("login");
        showToast("success", "회원가입 완료");
        return;
      }

      const data = await request("/api/auth/login", {
        method: "POST",
        auth: false,
        body: {
          email: authForm.email.trim(),
          password: authForm.password,
        },
      });

      const nextToken = normalizeTokenValue(getAuthTokenFromResponse(data));
      if (!nextToken) throw new Error("로그인 응답에 token이 없습니다.");

      localStorage.setItem(TOKEN_KEY, nextToken);
      setToken(nextToken);
      setPage(0);
      showToast("success", "로그인 완료");
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleCreateInform(event) {
    event.preventDefault();

    if (!createPayload.title || !createPayload.body || !createPayload.sendAt) {
      showToast("error", "제목, 내용, 시간을 입력하세요.");
      return;
    }

    if (!isFutureSendAt(createPayload.sendAt)) {
      showToast("error", "전송 시간은 현재보다 미래여야 합니다.");
      return;
    }

    if (form.repeatType === "DAYS" && !createPayload.repeatDays) {
      showToast("error", "요일을 하나 이상 선택하세요.");
      return;
    }

    setBusyAction("create");
    try {
      await request("/api/informs", {
        method: "POST",
        body: createPayload,
      });
      setForm(buildCreateForm());
      setPage(0);
      await loadInforms();
      showToast("success", "알림 생성 완료");
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function handleRegisterDevice(event) {
    event.preventDefault();
    if (!deviceToken.trim()) {
      showToast("error", "FCM 토큰을 입력하세요.");
      return;
    }

    setBusyAction("device");
    try {
      await request("/api/device-tokens", {
        method: "POST",
        body: {
          token: deviceToken.trim(),
          platform: "WEB",
        },
      });
      setDeviceToken("");
      showToast("success", "디바이스 토큰 등록 완료");
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function handleAutoRegisterFcm() {
    const missingKeys = getMissingFirebaseKeys();
    if (missingKeys.length > 0) {
      showToast("error", `Firebase 환경변수 누락: ${missingKeys.join(", ")}`);
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      showToast("error", "이 브라우저는 Web Push를 지원하지 않습니다.");
      return;
    }

    if (!window.isSecureContext) {
      showToast("error", "FCM은 HTTPS 또는 localhost에서만 동작합니다.");
      return;
    }

    setBusyAction("firebase");
    try {
      const [
        { initializeApp, getApp, getApps },
        { getMessaging, getToken, isSupported },
      ] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);

      if (!(await isSupported())) {
        throw new Error("이 브라우저는 Firebase Messaging을 지원하지 않습니다.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("브라우저 알림 권한이 허용되지 않았습니다.");
      }

      const serviceWorkerRegistration =
        await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      await navigator.serviceWorker.ready;

      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const messaging = getMessaging(app);
      const currentToken = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration,
      });

      if (!currentToken) {
        throw new Error("FCM 토큰을 발급받지 못했습니다.");
      }

      setPlatform("WEB");
      setDeviceToken(currentToken);
      await request("/api/device-tokens", {
        method: "POST",
        body: {
          token: currentToken,
          platform: "WEB",
        },
      });
      showToast("success", "FCM 토큰 자동 등록 완료");
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function handleToggle(id) {
    setBusyAction(`toggle-${id}`);
    try {
      await request(`/api/informs/${id}/toggle`, { method: "PATCH" });
      await loadInforms();
      showToast("success", "상태 변경 완료");
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function handleDelete(id) {
    const ok = window.confirm("알림을 삭제할까요?");
    if (!ok) return;

    setBusyAction(`delete-${id}`);
    try {
      await request(`/api/informs/${id}`, { method: "DELETE" });
      await loadInforms();
      showToast("success", "삭제 완료");
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function openEdit(inform) {
    setBusyAction(`edit-${inform.id}`);
    try {
      const detail = await request(`/api/informs/${inform.id}`);
      const target = detail || inform;
      setEditing(target);
      setEditForm({
        title: target.title || "",
        body: target.body || "",
        sendAt: toInputDateTime(target.sendAt),
        repeatType: "",
        repeatDays: [],
      });
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function handleUpdateInform(event) {
    event.preventDefault();
    if (!editing || !editForm) return;

    const repeatDays =
      editForm.repeatType === "DAYS" && editForm.repeatDays.length > 0
        ? editForm.repeatDays.join(",")
        : null;

    const nextSendAt = normalizeSendAt(editForm.sendAt);
    if (nextSendAt && !isFutureSendAt(nextSendAt)) {
      showToast("error", "전송 시간은 현재보다 미래여야 합니다.");
      return;
    }

    setBusyAction("update");
    try {
      await request(`/api/informs/${editing.id}`, {
        method: "PUT",
        body: {
          title: editForm.title.trim() || null,
          body: editForm.body.trim() || null,
          sendAt: nextSendAt,
          repeatType: editForm.repeatType || null,
          repeatDays,
        },
      });
      setEditing(null);
      setEditForm(null);
      await loadInforms();
      showToast("success", "수정 완료");
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setBusyAction("");
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setInforms([]);
    setAuthForm(emptyAuth);
    setEditing(null);
    showToast("success", "로그아웃 완료");
  }

  function updateDay(nextDay, target = "create") {
    const setter = target === "edit" ? setEditForm : setForm;
    setter((current) => {
      const exists = current.repeatDays.includes(nextDay);
      const repeatDays = exists
        ? current.repeatDays.filter((day) => day !== nextDay)
        : [...current.repeatDays, nextDay];
      return { ...current, repeatDays };
    });
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="brand">
          <img src="/dev-alram-symbol.svg" alt="" className="brandMark" />
          <div>
            <p className="eyebrow">Backend {BACKEND_LABEL}</p>
            <h1>Dev알람</h1>
          </div>
        </div>
        {isAuthed ? (
          <button className="ghostButton" onClick={handleLogout} type="button">
            <LogOut size={18} />
            로그아웃
          </button>
        ) : null}
      </header>

      {toast ? (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === "success" ? <Check size={18} /> : <X size={18} />}
          {toast.message}
        </div>
      ) : null}

      {!isAuthed ? (
        <section className="authBand">
          <div className="authVisual" aria-hidden="true">
            <Bell size={58} />
            <div className="timeline">
              <span />
              <strong />
              <span />
            </div>
          </div>

          <form className="authPanel" onSubmit={handleAuthSubmit}>
            <div className="segmented" aria-label="auth mode">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                로그인
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => setAuthMode("signup")}
              >
                회원가입
              </button>
            </div>

            {authMode === "signup" ? (
              <label>
                사용자명
                <input
                  value={authForm.username}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, username: event.target.value })
                  }
                  autoComplete="username"
                  required
                />
              </label>
            ) : null}

            <label>
              이메일
              <input
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm({ ...authForm, email: event.target.value })
                }
                autoComplete="email"
                required
              />
            </label>

            <label>
              비밀번호
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm({ ...authForm, password: event.target.value })
                }
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                required
              />
            </label>

            <button className="primaryButton" disabled={authBusy} type="submit">
              {authBusy ? <RefreshCw className="spin" size={18} /> : null}
              {authMode === "login" ? "로그인" : "가입하기"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="dashboardGrid">
            <form className="workPanel createPanel" onSubmit={handleCreateInform}>
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Create</p>
                  <h2>알림 생성</h2>
                </div>
                <CalendarClock size={22} />
              </div>

              <label>
                제목
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  required
                />
              </label>

              <label>
                내용
                <textarea
                  value={form.body}
                  onChange={(event) =>
                    setForm({ ...form, body: event.target.value })
                  }
                  required
                />
              </label>

              <label>
                전송 시간
                <input
                  type="datetime-local"
                  step="1"
                  value={form.sendAt}
                  onChange={(event) =>
                    setForm({ ...form, sendAt: event.target.value })
                  }
                  required
                />
              </label>

              <div className="fieldGroup">
                <span>반복</span>
                <div className="repeatGrid">
                  {repeatTypes.map((type) => (
                    <button
                      key={type.value}
                      className={form.repeatType === type.value ? "active" : ""}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          repeatType: type.value,
                          repeatDays:
                            type.value === "DAYS" ? form.repeatDays : [],
                        })
                      }
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.repeatType === "DAYS" ? (
                <div className="dayGrid" aria-label="repeat days">
                  {dayOptions.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      className={
                        form.repeatDays.includes(day.value) ? "active" : ""
                      }
                      onClick={() => updateDay(day.value)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <button
                className="primaryButton"
                disabled={busyAction === "create"}
                type="submit"
              >
                {busyAction === "create" ? (
                  <RefreshCw className="spin" size={18} />
                ) : (
                  <Plus size={18} />
                )}
                생성
              </button>
            </form>

            <form className="workPanel devicePanel" onSubmit={handleRegisterDevice}>
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">FCM</p>
                  <h2>토큰 등록</h2>
                </div>
                <Smartphone size={22} />
              </div>

              <label>
                FCM 토큰
                <textarea
                  className="tokenInput"
                  value={deviceToken}
                  onChange={(event) => setDeviceToken(event.target.value)}
                  required
                />
              </label>

              <label>
                플랫폼
                <select
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value)}
                >
                  <option value="WEB">WEB</option>
                </select>
              </label>

              <div className="deviceButtons">
                <button
                  className="secondaryButton"
                  disabled={busyAction === "firebase"}
                  type="button"
                  onClick={handleAutoRegisterFcm}
                >
                  {busyAction === "firebase" ? (
                    <RefreshCw className="spin" size={18} />
                  ) : (
                    <KeyRound size={18} />
                  )}
                  자동 발급
                </button>
                <button
                  className="primaryButton"
                  disabled={busyAction === "device"}
                  type="submit"
                >
                  {busyAction === "device" ? (
                    <RefreshCw className="spin" size={18} />
                  ) : (
                    <Check size={18} />
                  )}
                  등록
                </button>
              </div>
            </form>
          </section>

          <section className="listBand">
            <div className="listHeader">
              <div>
                <p className="eyebrow">Informs</p>
                <h2>알림 목록</h2>
              </div>
              <div className="listActions">
                <button
                  className="iconButton"
                  type="button"
                  onClick={loadInforms}
                  aria-label="새로고침"
                  title="새로고침"
                >
                  <RefreshCw className={loading ? "spin" : ""} size={18} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="emptyState">불러오는 중</div>
            ) : informs.length === 0 ? (
              <div className="emptyState">알림 없음</div>
            ) : (
              <div className="informList">
                {informs.map((inform) => (
                  <article className="informCard" key={inform.id}>
                    <div className="informMain">
                      <div className="informTitleRow">
                        <h3>{inform.title}</h3>
                        <span className={`statusPill ${statusTone(inform.status)}`}>
                          {statusLabel(inform.status)}
                        </span>
                      </div>
                      <p>{inform.body}</p>
                      <div className="informMeta">
                        <span>{displayDate(inform.sendAt)}</span>
                        <span>{inform.enabled ? "ON" : "OFF"}</span>
                      </div>
                      {inform.failReason ? (
                        <div className="failReason">
                          실패 사유: {inform.failReason}
                        </div>
                      ) : null}
                    </div>
                    <div className="cardActions">
                      <button
                        className={`toggleButton ${inform.enabled ? "on" : ""}`}
                        type="button"
                        onClick={() => handleToggle(inform.id)}
                        aria-label="ON/OFF"
                        title="ON/OFF"
                        disabled={busyAction === `toggle-${inform.id}`}
                      >
                        <Power size={17} />
                      </button>
                      <button
                        className="iconButton"
                        type="button"
                        onClick={() => openEdit(inform)}
                        aria-label="수정"
                        title="수정"
                        disabled={busyAction === `edit-${inform.id}`}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="iconButton danger"
                        type="button"
                        onClick={() => handleDelete(inform.id)}
                        aria-label="삭제"
                        title="삭제"
                        disabled={busyAction === `delete-${inform.id}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="pagination">
              <button
                className="iconButton"
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                aria-label="이전"
                title="이전"
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {pageInfo.totalElements}개 · {pageInfo.number + 1}/
                {Math.max(pageInfo.totalPages, 1)}
              </span>
              <button
                className="iconButton"
                type="button"
                disabled={pageInfo.totalPages <= 0 || page >= pageInfo.totalPages - 1}
                onClick={() => setPage((current) => current + 1)}
                aria-label="다음"
                title="다음"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
        </>
      )}

      {editing && editForm ? (
        <div className="modalBackdrop" role="presentation">
          <form className="editModal" onSubmit={handleUpdateInform}>
            <div className="modalHeader">
              <h2>알림 수정</h2>
              <button
                className="iconButton"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setEditForm(null);
                }}
                aria-label="닫기"
                title="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <label>
              제목
              <input
                value={editForm.title}
                onChange={(event) =>
                  setEditForm({ ...editForm, title: event.target.value })
                }
              />
            </label>

            <label>
              내용
              <textarea
                value={editForm.body}
                onChange={(event) =>
                  setEditForm({ ...editForm, body: event.target.value })
                }
              />
            </label>

            <label>
              전송 시간
              <input
                type="datetime-local"
                step="1"
                value={editForm.sendAt}
                onChange={(event) =>
                  setEditForm({ ...editForm, sendAt: event.target.value })
                }
              />
            </label>

            <label>
              반복
              <select
                value={editForm.repeatType}
                onChange={(event) =>
                  setEditForm({
                    ...editForm,
                    repeatType: event.target.value,
                    repeatDays:
                      event.target.value === "DAYS" ? editForm.repeatDays : [],
                  })
                }
              >
                <option value="">유지</option>
                <option value="ONCE">1회</option>
                <option value="DAILY">매일</option>
                <option value="WEEKLY">매주</option>
                <option value="DAYS">요일</option>
              </select>
            </label>

            {editForm.repeatType === "DAYS" ? (
              <div className="dayGrid" aria-label="edit repeat days">
                {dayOptions.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={
                      editForm.repeatDays.includes(day.value) ? "active" : ""
                    }
                    onClick={() => updateDay(day.value, "edit")}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            ) : null}

            <button
              className="primaryButton"
              disabled={busyAction === "update"}
              type="submit"
            >
              {busyAction === "update" ? (
                <RefreshCw className="spin" size={18} />
              ) : (
                <Check size={18} />
              )}
              저장
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
