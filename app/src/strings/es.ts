/**
 * Spanish translation seed.
 *
 * Not exhaustive — the ~60 most user-facing keys are translated to prove
 * the locale plumbing. Untranslated keys fall through to English defaults.
 * Extend as needed; keys must exactly match DEFAULT_STRINGS.
 */

import type { StringMap } from "./defaults";

export const ES: Partial<StringMap> = {
  app_name: "Ripple Wellness",

  // Auth
  auth_login_title: "Bienvenido de nuevo",
  auth_login_subtitle: "Inicia sesión en tu cuenta",
  auth_email_placeholder: "Correo electrónico",
  auth_password_placeholder: "Contraseña",
  auth_login_button: "Iniciar sesión",
  auth_no_account: "¿No tienes una cuenta?",
  auth_sign_up_link: "Regístrate",
  auth_signup_title: "Crear cuenta",
  auth_signup_subtitle: "Comienza a monitorear tu bienestar",

  // Common actions
  common_cancel: "Cancelar",
  common_save: "Guardar",
  common_delete: "Eliminar",
  common_remove: "Quitar",
  common_done: "Listo",
  common_ok: "OK",
  common_close: "Cerrar",
  common_back: "Atrás",
  common_next: "Siguiente",
  common_skip: "Omitir",
  common_edit: "Editar",
  common_retry: "Reintentar",
  common_loading: "Cargando…",
  common_saving: "Guardando…",
  common_error_generic: "Algo salió mal. Por favor, inténtalo de nuevo.",
  common_error_network: "No se pudo conectar. Revisa tu conexión a Internet.",
  common_no_data: "No hay datos disponibles.",
  common_unavailable: "No disponible",

  // Dashboard / editor
  dashboard_editor_title: "Personalizar",
  dashboard_editor_done: "Listo",
  dashboard_editor_reset: "Restablecer",
};

export const LOCALES = {
  en: null,      // English is the default; no partial required.
  es: ES,
} as const;

export type LocaleKey = keyof typeof LOCALES;
