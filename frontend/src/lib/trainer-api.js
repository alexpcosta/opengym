// Trainer mode, admin side: thin wrappers over /api/trainer/* (api/trainer/routes.js).
import { api } from './api.js'

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) })
const put = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body || {}) })

export const fetchStudents = () => api('/api/trainer/students')
export const fetchStudent = id => api('/api/trainer/student?id=' + encodeURIComponent(id))
export const fetchUnread = () => api('/api/trainer/unread')
export const fetchEvents = (sid, limit = 100) => api('/api/trainer/events?limit=' + limit + (sid ? '&sid=' + encodeURIComponent(sid) : ''))
export const markEventsRead = () => post('/api/trainer/events/read')
export const fetchPrefs = () => api('/api/trainer/prefs')
export const savePrefs = (prefs, times) => put('/api/trainer/prefs', { prefs, times })
export const sendPlan = (id, baseVersion, plan) => put('/api/trainer/plan', { id, baseVersion, plan })
export const removePlan = id => post('/api/trainer/plan/remove', { id })
export const sendDiet = (id, baseVersion, diet) => put('/api/trainer/diet', { id, baseVersion, diet })
export const removeDiet = id => post('/api/trainer/diet/remove', { id })
export const fetchStudentDiet = id => api('/api/trainer/diet?id=' + encodeURIComponent(id))
export const sendSupps = (id, baseVersion, supps) => put('/api/trainer/supps', { id, baseVersion, supps })
export const removeSupps = id => post('/api/trainer/supps/remove', { id })
export const fetchStudentSupps = id => api('/api/trainer/supps?id=' + encodeURIComponent(id))
export const fetchTrainerFoodsAdmin = () => api('/api/trainer/foods').then(d => d.foods || [])
export const saveTrainerFood = food => post('/api/trainer/foods', { food })
export const deleteTrainerFood = id => post('/api/trainer/foods/delete', { id })
