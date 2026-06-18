import axios from 'axios'
import { config } from '../config'

const apiClient = axios.create({
    baseURL: config.api.baseURL,
    timeout: config.api.timeout,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
})

apiClient.interceptors.request.use(request => {
    if (config.logLevel === 'debug') {
        console.log(`[API] ${request.method.toUpperCase()} ${request.baseURL}${request.url}`)
    }
    return request
})

apiClient.interceptors.response.use(
    response => response,
    error => {
        console.error(`[API Error] ${error.message}`)
        if (error.response?.status === 401) console.error('[API] No autorizado')
        if (error.response?.status === 503) console.error('[API] Servidor no disponible')
        return Promise.reject(error)
    }
)

export const apiVentas = {
    getAll:    ()           => apiClient.get('/ventas'),
    getById:   (id)         => apiClient.get(`/ventas/${id}`),
    create:    (data)       => apiClient.post('/ventas', data),
    update:    (id, data)   => apiClient.put(`/ventas/${id}`, data),
}

export const apiDespachos = {
    getAll:    ()           => apiClient.get('/despachos'),
    getById:   (id)         => apiClient.get(`/despachos/${id}`),
    create:    (data)       => apiClient.post('/despachos', data),
    update:    (id, data)   => apiClient.put(`/despachos/${id}`, data),
}

export default apiClient
