export const config = {
    api: {
        baseURL: import.meta.env.VITE_API_URL,
        timeout: parseInt(import.meta.env.VITE_TIMEOUT) || 10000,
        retryAttempts: parseInt(import.meta.env.VITE_RETRY_ATTEMPTS) || 3,
    },
    environment: import.meta.env.VITE_ENVIRONMENT || 'development',
    logLevel: import.meta.env.VITE_LOG_LEVEL || 'info',
}

if (!config.api.baseURL) {
    console.error('❌ VITE_API_URL no está definida en .env')
    throw new Error('Configuración inválida: falta VITE_API_URL')
}
