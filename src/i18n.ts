
export type SupportedLanguage = 'it' | 'en' | 'es' | 'de' | 'fr';

const translations: Record<SupportedLanguage, Record<string, string>> = {
    it: {
        'auth.invalid_credentials': 'Email o password non validi',
        'validation.error': 'Errore di validazione',
        'auth.login_successful': 'Login effettuato con successo',
        'auth.logout_success': 'Logout effettuato con successo',
        'auth.logout_failed': 'Logout fallito',
        'auth.refresh_failed': 'Refresh token non valido',
        'auth.refresh_success': 'Token aggiornato con successo',
        'common.unknown_error': 'Errore sconosciuto',
    },
    en: {
        'auth.invalid_credentials': 'Invalid credentials',
        'validation.error': 'Validation Error',
        'auth.login_successful': 'Login successful',
        'auth.logout_success': 'Logged out successfully',
        'auth.logout_failed': 'Failed to logout',
        'auth.refresh_failed': 'Refresh token required',
        'auth.refresh_success': 'Token refreshed successfully',
        'common.unknown_error': 'Unknown error',
    },
    es: {
        'auth.invalid_credentials': 'Email o contraseña no válidos',
        'validation.error': 'Error de validación',
        'auth.login_successful': 'Inicio de sesión exitoso',
        'auth.logout_success': 'Sesión cerrada exitosamente',
        'auth.logout_failed': 'Error al cerrar sesión',
        'auth.refresh_failed': 'Token de actualización requerido',
        'auth.refresh_success': 'Token actualizado con éxito',
        'common.unknown_error': 'Error desconocido',
    },
    de: {
        'auth.invalid_credentials': 'Ungültige Anmeldeinformationen',
        'validation.error': 'Validierungsfehler',
        'auth.login_successful': 'Anmeldung erfolgreich',
        'auth.logout_success': 'Erfolgreich abgemeldet',
        'auth.logout_failed': 'Abmeldung fehlgeschlagen',
        'auth.refresh_failed': 'Aktualisierungs-Token erforderlich',
        'auth.refresh_success': 'Token erfolgreich aktualisiert',
        'common.unknown_error': 'Unbekannter Fehler',
    },
    fr: {
        'auth.invalid_credentials': 'Identifiants invalides',
        'validation.error': 'Erreur de validation',
        'auth.login_successful': 'Connexion réussie',
        'auth.logout_success': 'Déconnexion réussie',
        'auth.logout_failed': 'Échec de la déconnexion',
        'auth.refresh_failed': 'Jeton de rafraîchissement requis',
        'auth.refresh_success': 'Jeton mis à jour avec succès',
        'common.unknown_error': 'Erreur inconnue',
    }
};

export const translate = (key: string, lang: string = 'en'): string => {
    const language = (translations[lang as SupportedLanguage] ? lang : 'en') as SupportedLanguage;
    return translations[language][key] || key;
};

import { Elysia } from "elysia";


export const deriveLang = ({ request }: { request: Request }) => {
    const acceptLanguage = request.headers.get("accept-language");
    const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "en";
    return { lang };
};


