"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { PublicStudyConfig, StudyInput } from "@/lib/study-schema";

type VisibleMessage = { id: string; role: "assistant" | "user"; text: string };
type RetryAnswer = {
  clientAttemptId: string;
  text: string;
  intent?: "answer" | "skip";
  inputPayload: { type: StudyInput["type"]; selectedValues?: string[]; freeText?: string };
};
type PendingAnswer = RetryAnswer & { stateRevision: number; anchorId: string };
type ConversationView = {
  status: "active" | "completed" | "paused";
  completionQuality: "complete" | "with_evidence_gaps" | null;
  stateRevision: number;
  anchorId: string | null;
  prompt: string | null;
  replyLanguage: string;
  messages: VisibleMessage[];
  input: StudyInput | null;
  media: Array<{ type: "image"; src: string; alt: Record<string, string> }>;
  progress: { current: number; total: number; label: string };
  savedProviderFailures: number;
  retry?: RetryAnswer | null;
  retryExhausted?: boolean;
  pendingGapCount: number;
  completion: null | { participationCode: string; message: string; rewardStatus: "not_connected" };
};

type SessionData = { entryToken: string; participationCode: string; studyVersion: string };
type Draft = { freeText: string; selected: string[]; inputType: StudyInput["type"] };
type AppState = "loading" | "consent" | "declined" | "stopped" | "interview" | "error" | "deleted";
class SessionRestoreError extends Error {
  constructor(message: string, readonly unavailableSession: boolean) { super(message); }
}

const UI_COPY: Record<string, Record<string, string>> = {
  en: { preparing: "Preparing the study…", before: "Before you start", back: "Back", progress: "Progress", format: "Format", textInterview: "Text interview", language: "Language", version: "Study version", privacy: "You may skip a question or stop. Do not enter contact details.", researchAi: "Oedro Buddy", you: "You", reviewing: "Reviewing your answer…", answer: "Your answer", context: "Add context (optional)", anyLanguage: "Write in any language…", send: "Send answer", skip: "Skip question", stop: "Stop and leave", stoppedTitle: "The interview has stopped", stoppedText: "Your existing answers remain stored under the study retention policy. No new questions will be asked.", complete: "Interview complete", thanks: "Thank you", reference: "Reference code", download: "Download my record", clear: "Clear local session" },
  es: { preparing: "Preparando el estudio…", before: "Antes de comenzar", back: "Volver", progress: "Progreso", format: "Formato", textInterview: "Entrevista por texto", language: "Idioma", version: "Versión del estudio", privacy: "Puedes omitir una pregunta o detenerte. No introduzcas datos de contacto.", researchAi: "Oedro Buddy", you: "Tú", reviewing: "Revisando tu respuesta…", answer: "Tu respuesta", context: "Añadir contexto (opcional)", anyLanguage: "Escribe en cualquier idioma…", send: "Enviar respuesta", skip: "Omitir pregunta", stop: "Detener y salir", stoppedTitle: "La entrevista se detuvo", stoppedText: "Tus respuestas existentes siguen guardadas según la política de conservación. No se harán más preguntas.", complete: "Entrevista completada", thanks: "Gracias", reference: "Código de referencia", download: "Descargar mi registro", clear: "Borrar sesión local" },
  "zh-CN": { preparing: "正在准备问卷…", before: "开始之前", back: "返回", progress: "进度", format: "形式", textInterview: "文字访谈", language: "语言", version: "问卷版本", privacy: "你可以跳过问题或停止。请不要填写联系方式。", researchAi: "Oedro Buddy", you: "你", reviewing: "正在理解你的回答…", answer: "你的回答", context: "补充说明（可选）", anyLanguage: "可以使用任何语言回答…", send: "发送回答", skip: "跳过这题", stop: "停止并离开", stoppedTitle: "访谈已经停止", stoppedText: "已有回答会按当前数据保留规则保存，系统不会继续提问。", complete: "访谈完成", thanks: "谢谢", reference: "参与编号", download: "下载我的记录", clear: "清除本地会话" }
};

const RECOVERY_COPY: Record<string, Record<string, string>> = {
  en: { saved: "Your answer is saved. The next question could not be prepared.", uncertain: "We couldn’t confirm the next question. Your answer is kept here for another try.", exhausted: "Your answer is saved, but we still can’t continue this question. You can skip it or stop.", retry: "Try again", conversation: "Research conversation", composer: "Answer the current question" },
  es: { saved: "Tu respuesta está guardada. No se pudo preparar la siguiente pregunta.", uncertain: "No pudimos confirmar la siguiente pregunta. Tu respuesta sigue aquí para volver a intentarlo.", exhausted: "Tu respuesta está guardada, pero no podemos continuar con esta pregunta. Puedes omitirla o detenerte.", retry: "Reintentar", conversation: "Conversación de investigación", composer: "Responde a la pregunta actual" },
  "zh-CN": { saved: "你的回答已保存，暂时未能生成下一题。", uncertain: "暂时无法确认下一题，你的回答还保留在这里，可以重试。", exhausted: "你的回答已保存，但这题暂时无法继续。你可以跳过这题或停止访谈。", retry: "重试", conversation: "调研对话", composer: "回答当前问题" },
};

const DATA_COPY: Record<string, Record<string, string>> = {
  en: { remove: "Delete my answers", confirm: "Delete saved answers?", detail: "This removes this interview from the local database. Previously downloaded files are not removed.", cancel: "Keep answers", deleted: "Your answers have been deleted", restart: "Start another interview", conflict: "Another tab moved to a different question. This answer was not submitted:", dismiss: "Dismiss", synthetic: "Synthetic test session" },
  es: { remove: "Eliminar mis respuestas", confirm: "¿Eliminar las respuestas guardadas?", detail: "Esto elimina esta entrevista de la base de datos local. Los archivos ya descargados no se eliminan.", cancel: "Conservar respuestas", deleted: "Tus respuestas se han eliminado", restart: "Iniciar otra entrevista", conflict: "Otra pestaña pasó a otra pregunta. Esta respuesta no se envió:", dismiss: "Cerrar", synthetic: "Sesión de prueba sintética" },
  "zh-CN": { remove: "删除我的回答", confirm: "删除已保存的回答？", detail: "这会从本地数据库删除本次访谈。此前下载的文件不会自动删除。", cancel: "保留回答", deleted: "你的回答已删除", restart: "开始另一场访谈", conflict: "另一标签页已进入新问题。以下回答没有提交：", dismiss: "收起", synthetic: "模拟测试会话" },
};

const LOCAL_COPY: Record<string, Record<string, string>> = {
  en: { draft: "This browser could not save your draft. Keep this page open; refreshing may lose it.", corrupt: "A saved draft could not be read. It has not been replaced.", session: "This browser could not save your session. Keep this page open to continue or download your record.", cleanup: "The server action succeeded, but this browser could not clear its local copy.", exportFailed: "The record could not be downloaded. Your answers are unchanged. Please try again.", exporting: "Preparing download…", stopUnknown: "We could not confirm that the interview stopped. Please try again.", storageBlocked: "Browser storage is unavailable. No new interview was started. Restore storage access and try again." },
  es: { draft: "El navegador no pudo guardar el borrador. Mantén esta página abierta; al recargar podrías perderlo.", corrupt: "No se pudo leer un borrador guardado. No se ha reemplazado.", session: "El navegador no pudo guardar la sesión. Mantén esta página abierta para continuar o descargar tu registro.", cleanup: "La acción del servidor se completó, pero no se pudo borrar la copia local.", exportFailed: "No se pudo descargar el registro. Tus respuestas no han cambiado. Inténtalo de nuevo.", exporting: "Preparando descarga…", stopUnknown: "No pudimos confirmar que la entrevista se detuvo. Inténtalo de nuevo.", storageBlocked: "El almacenamiento del navegador no está disponible. No se inició otra entrevista. Restablece el acceso e inténtalo de nuevo." },
  "zh-CN": { draft: "浏览器未能保存草稿。请保留此页面，刷新可能丢失未发送的内容。", corrupt: "已有草稿无法读取，尚未覆盖它。", session: "浏览器未能保存会话。请保留此页面以继续访谈或下载记录。", cleanup: "服务端操作已成功，但浏览器未能清除本地副本。", exportFailed: "记录未能下载，已有回答没有改变。请重试。", exporting: "正在准备下载…", stopUnknown: "暂时无法确认访谈是否已停止，请重试。", storageBlocked: "浏览器存储不可用，尚未开启新的访谈。请恢复存储权限后重试。" },
};

const draftKeyFor = (sessionKey: string, session: SessionData, view: ConversationView) =>
  [sessionKey, "draft", encodeURIComponent(session.participationCode), view.stateRevision, encodeURIComponent(view.anchorId || "")].join(":");

const matchingDraft = (value: unknown, input: StudyInput): Draft | null => {
  if (!value || typeof value !== "object") return null;
  const draft = value as Draft;
  if (draft.inputType !== input.type || typeof draft.freeText !== "string" || draft.freeText.length > 3000 ||
      !Array.isArray(draft.selected) || draft.selected.some((item) => typeof item !== "string") ||
      new Set(draft.selected).size !== draft.selected.length) return null;
  const allowed = input.type === "text" ? [] : input.type === "scale"
    ? Array.from({ length: input.max - input.min + 1 }, (_, index) => String(input.min + index))
    : input.options.map((item) => item.id);
  if (draft.selected.some((item) => !allowed.includes(item))) return null;
  const limit = input.type === "single_choice" || input.type === "scale" ? 1 : input.type === "multiple_choice" ? input.maxSelections ?? allowed.length : 0;
  if (draft.selected.length > limit) return null;
  return draft;
};

const pickLocale = (values: Record<string, string>, locale: string, fallback: string) => {
  if (values[locale]) return values[locale];
  const root = locale.split("-")[0];
  const key = Object.keys(values).find((item) => item.split("-")[0] === root);
  return (key && values[key]) || values[fallback] || Object.values(values)[0] || "";
};

const pickExactLocale = (values: Record<string, string>, locale: string) => {
  if (values[locale]) return values[locale];
  const root = locale.split("-")[0];
  const key = Object.keys(values).find((item) => item.split("-")[0] === root);
  return (key && values[key]) || "";
};

const languageName = (locale: string) => {
  try { return new Intl.DisplayNames([locale], { type: "language" }).of(locale) || locale; }
  catch { return locale; }
};

export function ResearchInterview({ study, requireConsent = false }: { study: PublicStudyConfig; requireConsent?: boolean }) {
  const baseLocale = study.study.languagePolicy.entryLanguage;
  const sessionKey = `research-session:${study.study.id}:${study.study.version}`;
  const pendingKey = `${sessionKey}:pending-answer`;
  const consentKey = `research-consent:${study.study.id}:${study.consent.version}`;
  const [appState, setAppState] = useState<AppState>("loading");
  const locale = baseLocale;
  const [consentChecked, setConsentChecked] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [freeText, setFreeText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [canStartNew, setCanStartNew] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<PendingAnswer | null>(null);
  const [answerSaved, setAnswerSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [conflictedAnswer, setConflictedAnswer] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [freshMessageId, setFreshMessageId] = useState<string | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const exportingRef = useRef(false);
  const shellRef = useRef<HTMLElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followingLatestRef = useRef(true);
  const submittingRef = useRef(false);
  const stoppedRef = useRef(false);
  const directStartRef = useRef(false);

  const consentCopy = study.consent.locales[locale] || study.consent.locales[baseLocale];
  const activeLocale = conversation?.replyLanguage || locale;
  const ui = UI_COPY[activeLocale] || (activeLocale.startsWith("zh") ? UI_COPY["zh-CN"] : UI_COPY[activeLocale.split("-")[0]]) || UI_COPY.en;
  const recoveryUi = RECOVERY_COPY[activeLocale] || (activeLocale.startsWith("zh") ? RECOVERY_COPY["zh-CN"] : RECOVERY_COPY[activeLocale.split("-")[0]]) || RECOVERY_COPY.en;
  const dataUi = DATA_COPY[activeLocale] || (activeLocale.startsWith("zh") ? DATA_COPY["zh-CN"] : DATA_COPY[activeLocale.split("-")[0]]) || DATA_COPY.en;
  const localUi = LOCAL_COPY[activeLocale] || (activeLocale.startsWith("zh") ? LOCAL_COPY["zh-CN"] : LOCAL_COPY[activeLocale.split("-")[0]]) || LOCAL_COPY.en;
  const retryAnswer = conversation?.retry && conversation.anchorId
    ? { ...conversation.retry, stateRevision: conversation.stateRevision, anchorId: conversation.anchorId }
    : pendingAnswer;

  const restoreDraft = useCallback((view: ConversationView, restoredSession: SessionData) => {
    if (view.status !== "active" || !view.anchorId || !view.input) return;
    try {
      const saved = sessionStorage.getItem(draftKeyFor(sessionKey, restoredSession, view));
      if (saved === null) return;
      const draft = matchingDraft(JSON.parse(saved), view.input);
      if (!draft) { setStorageNotice("corrupt"); return; }
      setFreeText(draft.freeText);
      setSelected(draft.selected);
    } catch { setStorageNotice("corrupt"); }
  }, [sessionKey]);

  const updateDraft = (text: string, values: string[]) => {
    setFreeText(text);
    setSelected(values);
    if (!session || !conversation?.anchorId || !conversation.input) return;
    try {
      sessionStorage.setItem(draftKeyFor(sessionKey, session, conversation), JSON.stringify({ freeText: text, selected: values, inputType: conversation.input.type }));
    } catch { setStorageNotice("draft"); }
  };

  const clearDraft = () => {
    if (!session || !conversation?.anchorId) return;
    try { sessionStorage.removeItem(draftKeyFor(sessionKey, session, conversation)); }
    catch { setStorageNotice("cleanup"); }
  };

  const followCurrentQuestion = useCallback(() => {
    const element = transcriptRef.current;
    if (!element) return;
    const question = element.querySelector<HTMLElement>('[data-current-question="true"]');
    const target = question || element.lastElementChild as HTMLElement | null;
    if (!target) return;
    const offset = target.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
    element.scrollTo({ top: Math.max(0, target.offsetHeight > element.clientHeight - 24 ? offset : offset + target.offsetHeight - element.clientHeight + 24), behavior: "instant" });
  }, []);

  const fetchConversation = useCallback(async (entryToken: string) => {
    const response = await fetch("/api/study/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryToken }), cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const unavailableSession = (response.status === 404 && payload.error === "not_found") || (response.status === 409 && payload.error === "version_mismatch") || (response.status === 410 && ["session_expired", "session_deleted", "retention_unknown"].includes(payload.error));
      throw new SessionRestoreError("This study session could not be restored.", unavailableSession);
    }
    return response.json() as Promise<ConversationView>;
  }, []);

  const initializeSession = useCallback(async (withConsent: boolean, requestedLocale: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/study/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentVersion: withConsent ? study.consent.version : undefined,
          consentLocale: withConsent ? requestedLocale : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The study could not be started.");
      const nextSession = { entryToken: payload.entryToken, participationCode: payload.participationCode, studyVersion: payload.studyVersion };
      setSession(nextSession);
      setConversation(payload.conversation);
      setAppState("interview");
      try {
        if (withConsent) localStorage.setItem(consentKey, JSON.stringify({ locale: requestedLocale, version: study.consent.version }));
        localStorage.setItem(sessionKey, JSON.stringify(nextSession));
      } catch { setStorageNotice("session"); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The study could not be started.");
      setAppState("error");
    } finally {
      setBusy(false);
    }
  }, [consentKey, sessionKey, study.consent.version]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      let restoringSession = false;
      try {
        const storedSession = JSON.parse(localStorage.getItem(sessionKey) || "null") as SessionData | null;
        if (storedSession?.entryToken && storedSession.studyVersion === study.study.version) {
          restoringSession = true;
          setSession(storedSession);
          const restored = await fetchConversation(storedSession.entryToken);
          setConversation(restored);
          restoreDraft(restored, storedSession);
          try {
            const pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null") as PendingAnswer | null;
            if (pending && pending.stateRevision === restored.stateRevision && pending.anchorId === restored.anchorId && restored.status === "active") setPendingAnswer(pending);
            else sessionStorage.removeItem(pendingKey);
          } catch { setStorageNotice("draft"); }
          setAppState(restored.status === "paused" ? "stopped" : "interview");
          return;
        }
        if (!requireConsent) {
          if (directStartRef.current) return;
          directStartRef.current = true;
          await initializeSession(false, baseLocale);
          return;
        }
        setAppState("consent");
      } catch (cause) {
        if (restoringSession) {
          const unavailableSession = cause instanceof SessionRestoreError && cause.unavailableSession;
          setCanStartNew(unavailableSession);
          setError(unavailableSession ? "This saved interview is no longer available in the current study. You can start a new interview." : "Your interview could not be loaded. Your session is still on this device. Try again to restore it.");
          setAppState("error");
          return;
        }
        setError(LOCAL_COPY.en.storageBlocked);
        setAppState("error");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [baseLocale, consentKey, fetchConversation, initializeSession, pendingKey, requireConsent, restoreDraft, sessionKey, study.study.version]);

  useEffect(() => {
    if (!followingLatestRef.current) { setShowLatest(true); return; }
    const frame = requestAnimationFrame(followCurrentQuestion);
    return () => cancelAnimationFrame(frame);
  }, [conversation?.messages.length, conversation?.prompt, busy, followCurrentQuestion]);

  useEffect(() => {
    if (appState !== "interview") return;
    const viewport = window.visualViewport;
    const resize = () => {
      shellRef.current?.style.setProperty("--survey-viewport", `${viewport?.height || window.innerHeight}px`);
      if (followingLatestRef.current) followCurrentQuestion();
    };
    const observer = new ResizeObserver(() => { if (followingLatestRef.current) followCurrentQuestion(); });
    if (transcriptRef.current) observer.observe(transcriptRef.current);
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    resize();
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); viewport?.removeEventListener("resize", resize); };
  }, [appState, followCurrentQuestion]);

  const start = async () => {
    if (!consentChecked || busy) return;
    await initializeSession(true, locale);
  };

  const activeInput = conversation?.input;
  const optionLabels = useMemo(() => {
    if (!activeInput || activeInput.type === "text" || activeInput.type === "scale") return new Map<string, string>();
    return new Map(activeInput.options.map((option) => [option.id, pickLocale(option.labels, activeLocale, baseLocale)]));
  }, [activeInput, activeLocale, baseLocale]);

  const submit = async (intent: "answer" | "skip" = "answer") => {
    if (!session || !conversation?.anchorId || !activeInput || busy || stopping || stoppedRef.current || submittingRef.current) return;
    const selectedLabels = selected.map((value) => optionLabels.get(value) || value);
    const text = intent === "skip" ? ui.skip : [...selectedLabels, freeText].filter((value) => value.length > 0).join(" — ");
    const request: PendingAnswer = intent === "answer" && retryAnswer ? retryAnswer : {
      clientAttemptId: crypto.randomUUID(), stateRevision: conversation.stateRevision, anchorId: conversation.anchorId,
      intent, text, inputPayload: { type: activeInput.type, selectedValues: selected, freeText: freeText || undefined },
    };
    if (!request.text.trim()) return;
    submittingRef.current = true;
    followingLatestRef.current = true;
    setShowLatest(false);
    setBusy(true);
    setError("");
    setPendingAnswer(request);
    try { sessionStorage.setItem(pendingKey, JSON.stringify(request)); } catch { setStorageNotice("draft"); }
    if (!retryAnswer || intent === "skip") {
      const optimistic: VisibleMessage = { id: `local-${request.clientAttemptId}`, role: "user", text: request.text };
      setConversation((current) => current ? { ...current, messages: [...current.messages, optimistic] } : current);
    }
    try {
      const response = await fetch("/api/study/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryToken: session.entryToken,
          ...request,
        }),
      });
      const payload = await response.json();
      if (stoppedRef.current) return;
      if (!response.ok) {
        if (response.status === 409 && !payload.answerSaved && ["revision_conflict", "anchor_conflict"].includes(payload.error)) setConflictedAnswer(request.text);
        setAnswerSaved(payload.answerSaved === true);
        if (!payload.answerSaved && response.status >= 400 && response.status < 500 && response.status !== 409) {
          setPendingAnswer(null);
          try { sessionStorage.removeItem(pendingKey); } catch { /* optional browser storage */ }
        }
        throw new Error(payload.message || "The answer could not be processed.");
      }
      setConversation(payload);
      setFreshMessageId((payload as ConversationView).messages.findLast((message) => message.role === "assistant")?.id || null);
      clearDraft();
      setPendingAnswer(null);
      try { sessionStorage.removeItem(pendingKey); } catch { /* optional browser storage */ }
      setAnswerSaved(false);
      if (payload.status === "paused") setAppState("stopped");
      setFreeText("");
      setSelected([]);
    } catch (cause) {
      if (stoppedRef.current) return;
      setError(cause instanceof Error ? cause.message : "The answer could not be processed.");
      try {
        const restored = await fetchConversation(session.entryToken);
        if (stoppedRef.current) return;
        setConversation(restored);
        if (restored.status === "paused") setAppState("stopped");
        if (restored.stateRevision > request.stateRevision || restored.status !== "active") {
          clearDraft();
          setPendingAnswer(null); setAnswerSaved(false); setError(""); setFreeText(""); setSelected([]);
          try { sessionStorage.removeItem(pendingKey); } catch { /* optional browser storage */ }
        } else if (restored.retry) setAnswerSaved(true);
      } catch { /* retain the same request ID for a transport retry */ }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!session || stopping) return;
    setStopping(true);
    setError("");
    try {
      const response = await fetch("/api/study/pause", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryToken: session.entryToken }) });
      if (!response.ok) throw new Error("The interview could not be stopped.");
      stoppedRef.current = true;
      clearDraft();
      try { sessionStorage.removeItem(pendingKey); } catch { setStorageNotice("cleanup"); }
      setAppState("stopped");
    } catch {
      try {
        const restored = await fetchConversation(session.entryToken);
        if (restored.status === "paused") {
          stoppedRef.current = true;
          setConversation(restored);
          clearDraft();
          setAppState("stopped");
          return;
        }
      } catch { /* A failed read cannot confirm whether the pause committed. */ }
      setError(localUi.stopUnknown);
    } finally {
      setStopping(false);
    }
  };

  const exportRecord = async () => {
    if (!session || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setError("");
    let url: string | null = null;
    try {
      const response = await fetch("/api/study/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryToken: session.entryToken }),
    });
      if (!response.ok) throw new Error("Export unavailable");
      const blob = await response.blob();
      const record = JSON.parse(await blob.text());
      if (!record || Array.isArray(record) || typeof record.schemaVersion !== "string" || !Array.isArray(record.turns) || record.participationCode !== session.participationCode || record.studyVersion !== session.studyVersion) throw new Error("Invalid export");
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${session.participationCode}.json`;
      link.click();
      const downloadedUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(downloadedUrl), 1000);
      url = null;
    } catch { setError(localUi.exportFailed); }
    finally {
      if (url) URL.revokeObjectURL(url);
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const clearLocalSession = () => {
    try {
      if (session && conversation?.anchorId) sessionStorage.removeItem(draftKeyFor(sessionKey, session, conversation));
      sessionStorage.removeItem(pendingKey);
      localStorage.removeItem(consentKey);
      localStorage.removeItem(sessionKey);
      window.location.reload();
    } catch { setError("This browser could not clear the session. No new interview was started."); }
  };

  const deleteAnswers = async () => {
    if (!session || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/study/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryToken: session.entryToken }) });
      if (!response.ok) throw new Error("The answers could not be deleted. Please try again.");
      stoppedRef.current = true;
      clearDraft();
      try {
        sessionStorage.removeItem(pendingKey);
        localStorage.removeItem(sessionKey);
      } catch { setStorageNotice("cleanup"); }
      setConversation(null);
      setPendingAnswer(null);
      setFreeText("");
      setConflictedAnswer("");
      setAppState("deleted");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The answers could not be deleted."); }
    finally { setDeleting(false); }
  };

  const dataControls = session && <div className="dataControls">
    {confirmDelete ? <section role="alert" className="deletionConfirmation"><h3>{dataUi.confirm}</h3><p>{dataUi.detail}</p><div><button className="secondaryButton" disabled={deleting} onClick={() => setConfirmDelete(false)}>{dataUi.cancel}</button><button className="secondaryButton dangerButton" disabled={deleting} onClick={() => void deleteAnswers()}>{dataUi.remove}</button></div></section> : <button className="textButton" onClick={() => setConfirmDelete(true)}>{dataUi.remove}</button>}
  </div>;

  const toggleOption = (value: string) => {
    if (!activeInput || activeInput.type === "text" || activeInput.type === "scale") return;
    if (activeInput.type === "single_choice") { updateDraft(freeText, [value]); return; }
    if (selected.includes(value)) { updateDraft(freeText, selected.filter((item) => item !== value)); return; }
    if (!activeInput.maxSelections || selected.length < activeInput.maxSelections) updateDraft(freeText, [...selected, value]);
  };

  if (appState === "loading") return <main className="loadingShell"><span className="spinner" /><p>{ui.preparing}</p></main>;

  const storageFeedback = storageNotice && <p className="storageNotice" role="status">{localUi[storageNotice as keyof typeof localUi]}</p>;
  if (appState === "deleted") return <main className="consentShell"><section className="consentPanel"><h1>{dataUi.deleted}</h1>{storageFeedback}{error && <p role="alert">{error}</p>}<button className="secondaryButton" onClick={clearLocalSession}>{dataUi.restart}</button></section></main>;

  if (appState === "error") return (
    <main className="consentShell">
      <section className="consentPanel">
        <p className="eyebrow">{study.brand.shortLabel}</p>
        <h1>The interview could not load</h1>
        <p className="lead">{error || "Reload the page to try again."}</p>
        {dataControls}
        <button className="secondaryButton" type="button" onClick={() => window.location.reload()}>Try again</button>
        {canStartNew && <button className="secondaryButton" type="button" onClick={clearLocalSession}>Start a new interview</button>}
      </section>
    </main>
  );

  if (appState === "declined") return (
    <main className="consentShell">
      <section className="consentPanel">
        <p className="eyebrow">{study.brand.shortLabel}</p>
        <h1>{consentCopy.declinedTitle}</h1>
        <p className="lead">{consentCopy.declinedText}</p>
        <button className="secondaryButton" type="button" onClick={() => setAppState("consent")}>{ui.back}</button>
      </section>
    </main>
  );

  if (appState === "stopped") return (
    <main className="consentShell">
      <section className="consentPanel">
        <p className="eyebrow">{study.brand.shortLabel}</p>
        <h1>{ui.stoppedTitle}</h1>
        <p className="lead">{ui.stoppedText}</p>
        <button className="secondaryButton" type="button" disabled={exporting} onClick={exportRecord}>{exporting ? localUi.exporting : ui.download}</button>
        {storageFeedback}
        {dataControls}
        <button className="textButton" type="button" onClick={clearLocalSession}>{dataUi.restart}</button>
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );

  if (appState === "consent") return (
    <main className="consentShell">
      <section className="consentPanel" aria-labelledby="consent-title">
        <div className="consentTopline"><span className="brandMark">{study.brand.shortLabel}</span><span>About {study.study.estimatedMinutes} min</span></div>
        <p className="eyebrow">{ui.before}</p>
        <h1 id="consent-title">{consentCopy.title}</h1>
        <p className="lead">{consentCopy.intro}</p>
        <ul className="consentList">{consentCopy.items.map((item) => <li key={item}>{item}</li>)}</ul>
        {(study.consent.internalOnly || study.study.status === "draft") && <p className="draftNotice">Internal preview. Do not invite real participants from this build.</p>}
        <label className="consentCheck"><input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} /><span>{consentCopy.checkbox}</span></label>
        {error && <p className="errorMessage" role="alert">{error}</p>}
        <div className="consentActions"><button className="primaryButton" type="button" disabled={!consentChecked || busy} onClick={start}>{busy ? "Starting…" : consentCopy.accept}</button><button className="secondaryButton" type="button" onClick={() => setAppState("declined")}>{consentCopy.decline}</button></div>
      </section>
    </main>
  );

  const completed = conversation?.status === "completed";
  const currentQuestionIndex = conversation?.messages.findLastIndex((message) => message.role === "assistant" && message.text === conversation.prompt);
  const visualUi = activeLocale.startsWith("zh")
    ? { pauseMotion: "暂停背景动态", resumeMotion: "开启背景动态", history: "查看本次对话", session: "本次访谈", topic: "话题", latest: "回到当前问题", shortcut: "⌘ / Ctrl + Enter 发送" }
    : activeLocale.startsWith("es")
    ? { pauseMotion: "Pausar movimiento", resumeMotion: "Activar movimiento", history: "Ver esta conversación", session: "Esta entrevista", topic: "Tema", latest: "Volver a la pregunta", shortcut: "⌘ / Ctrl + Enter para enviar" }
    : { pauseMotion: "Pause background motion", resumeMotion: "Resume background motion", history: "Review this conversation", session: "This interview", topic: "Topic", latest: "Back to current question", shortcut: "⌘ / Ctrl + Enter to send" };
  return (
    <main ref={shellRef} lang={activeLocale} className={`appShell lightResearchShell${completed ? ` isComplete${historyOpen ? " showHistory" : ""}` : ""}${conversation?.messages.length === 1 ? " isOpening" : ""}${motionPaused ? " motionPaused" : ""}`}>
      <header className="appHeader">
        <div className="identity"><span className="brandMark">{study.brand.shortLabel}</span><h1>{study.brand.tagline || study.study.title}</h1></div>
        <details className="sessionTools">
          <summary>{visualUi.session}</summary>
          <div className="sessionPopover">
            <p>{ui.privacy}</p>
            <button className="textButton motionControl" type="button" aria-pressed={motionPaused} onClick={() => setMotionPaused(!motionPaused)}>{motionPaused ? visualUi.resumeMotion : visualUi.pauseMotion}</button>
            <dl><div><dt>{ui.language}</dt><dd>{languageName(activeLocale)}</dd></div><div><dt>{ui.version}</dt><dd>{study.study.version}</dd></div></dl>
            <button className="textButton" type="button" onClick={clearLocalSession}>{ui.clear}</button>
            {!completed && dataControls}
          </div>
        </details>
      </header>
      <aside className="studyRail" aria-label={`${visualUi.topic} ${conversation?.progress.current ?? 1} / ${conversation?.progress.total ?? study.anchors.length}`}>
        <div className="topicPosition"><span>{visualUi.topic}</span><strong>{String(conversation?.progress.current ?? 1).padStart(2, "0")}</strong><span className="topicTotal">/ {String(conversation?.progress.total ?? study.anchors.length).padStart(2, "0")}</span></div>
        <div className="progressHorizon" aria-hidden="true">
          <span className="horizonFill" style={{ width: `${Math.max(0, ((conversation?.progress.current ?? 1) - 1) / Math.max(1, (conversation?.progress.total ?? study.anchors.length) - 1)) * 100}%` }} />
          <div className="horizonMarks">{study.anchors.map((anchor, index) => <i key={anchor.id} className={index === (conversation?.progress.current ?? 1) - 1 ? "current" : index < (conversation?.progress.current ?? 1) ? "reached" : ""} />)}</div>
        </div>
      </aside>
      <section className={`conversationArea${showLatest && !completed ? " hasEarlier" : ""}`} aria-label={recoveryUi.conversation}>
        <div className="transcript" ref={transcriptRef} role="log" aria-live="polite" aria-relevant="additions text" onScroll={() => { const element = transcriptRef.current; if (element) { followingLatestRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64; setShowLatest(!followingLatestRef.current); } }}>
          {conversation?.messages.map((message, index) => <article className={`message ${message.role}${message.id === freshMessageId ? " freshMessage" : ""}`} data-current-question={index === currentQuestionIndex || undefined} key={message.id}><span>{message.role === "assistant" ? ui.researchAi : ui.you}</span><p id={index === currentQuestionIndex ? "current-question" : undefined}>{message.text}</p></article>)}
          {busy && <article className="message assistant pending" role="status"><span>{ui.researchAi}</span><p>{ui.reviewing}</p></article>}
        </div>
        {!completed && showLatest && <button className="latestButton" onClick={() => { followingLatestRef.current = true; setShowLatest(false); followCurrentQuestion(); }}>{visualUi.latest} ↓</button>}
        {!completed && conversation && activeInput && <section className="composer" aria-label={recoveryUi.composer} aria-busy={busy}>
          <div className="composerBody">
          {storageFeedback}
          {conflictedAnswer && <section className="recoveryNotice" role="alert"><p>{dataUi.conflict}</p><blockquote>{conflictedAnswer}</blockquote><button className="textButton" onClick={() => setConflictedAnswer("")}>{dataUi.dismiss}</button></section>}
          {!busy && (retryAnswer || conversation.retryExhausted) && <p className="recoveryNotice" role="alert">{conversation.retryExhausted ? recoveryUi.exhausted : answerSaved || conversation.retry ? recoveryUi.saved : recoveryUi.uncertain}</p>}
          {conversation.media.map((item) => <figure className="studyMedia" key={item.src}><Image src={item.src} alt={pickLocale(item.alt, activeLocale, baseLocale)} width={1200} height={720} unoptimized /></figure>)}
          {(activeInput.type === "single_choice" || activeInput.type === "multiple_choice") && <div className="choiceGrid" data-choice-type={activeInput.type}>{activeInput.options.map((option) => {
            const checked = selected.includes(option.id);
            return <button key={option.id} type="button" disabled={busy || !!retryAnswer} aria-pressed={checked} className={checked ? "choice selected" : "choice"} onClick={() => toggleOption(option.id)}><span className="choiceIndicator" aria-hidden="true" /><span>{pickLocale(option.labels, activeLocale, baseLocale)}</span></button>;
          })}</div>}
          {activeInput.type === "scale" && <div className="scaleInput"><span>{activeInput.minLabels ? pickLocale(activeInput.minLabels, activeLocale, baseLocale) : activeInput.min}</span><div>{Array.from({ length: activeInput.max - activeInput.min + 1 }, (_, offset) => String(activeInput.min + offset)).map((value) => <button type="button" disabled={busy || !!retryAnswer} aria-pressed={selected.includes(value)} className={selected.includes(value) ? "scaleChoice selected" : "scaleChoice"} key={value} onClick={() => updateDraft(freeText, [value])}>{value}</button>)}</div><span>{activeInput.maxLabels ? pickLocale(activeInput.maxLabels, activeLocale, baseLocale) : activeInput.max}</span></div>}
          {(activeInput.type === "text" || (activeInput.type !== "scale" && activeInput.allowOther)) && <label className="textInput"><span>{activeInput.type === "text" ? ui.answer : ui.context}</span><textarea value={retryAnswer ? retryAnswer.inputPayload.freeText || retryAnswer.text : freeText} readOnly={busy || !!retryAnswer} aria-describedby={currentQuestionIndex !== -1 ? "current-question" : undefined} maxLength={3000} rows={3} placeholder={activeInput.type === "text" && activeInput.placeholder ? pickExactLocale(activeInput.placeholder, activeLocale) || ui.anyLanguage : ui.anyLanguage} onChange={(event) => updateDraft(event.target.value, selected)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} /></label>}
          {error && !retryAnswer && <p className="errorMessage" role="alert">{error}</p>}
          </div>
          <div className="composerActions"><div><button className="textButton" type="button" disabled={busy || stopping} onClick={() => void submit("skip")}>{ui.skip}</button><button className="textButton" type="button" disabled={stopping} onClick={stop}>{ui.stop}</button></div><button className="primaryButton" aria-label={busy ? ui.reviewing : retryAnswer || conversation.retryExhausted ? recoveryUi.retry : ui.send} type="button" disabled={busy || stopping || conversation.retryExhausted || (!retryAnswer && !freeText.trim() && !selected.length)} onClick={() => void submit()}>{busy ? ui.reviewing : retryAnswer || conversation.retryExhausted ? recoveryUi.retry : ui.send}</button></div>
          <div className="composerFootnote"><span>{ui.privacy}</span><span className="keyboardHint">{visualUi.shortcut}</span></div>
        </section>}
        {completed && conversation?.completion && <section className="completionPanel"><p className="eyebrow">{study.study.sampleKind === "synthetic" ? dataUi.synthetic : ui.complete}</p><h2>{ui.thanks}</h2><p>{conversation.completion.message}</p><p className="participationCode">{ui.reference} <strong>{conversation.completion.participationCode}</strong></p><button className="primaryButton" type="button" disabled={exporting} onClick={exportRecord}>{exporting ? localUi.exporting : ui.download}</button>{storageFeedback}{dataControls}<button className="textButton" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>{visualUi.history}</button>{error && <p className="errorMessage" role="alert">{error}</p>}</section>}
      </section>
    </main>
  );
}
