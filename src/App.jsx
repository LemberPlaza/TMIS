import { useEffect, useMemo, useRef, useState } from 'react'
import atiLogo from '../images/ati logo.png'
import { exportEvaluationFormDocx, exportEvaluationReportDocx } from './docxExport'
import { importCriteriaAssessmentWorkbook } from './excelImport'

// const API_BASE_URL = 'http://localhost/tmis-api'
const API_BASE_URL = 'https://arrpe.aticaraga.tech/tmis-api'

const initialBatchForm = {
  name: '',
  date: new Date().toISOString().slice(0, 10),
  rpCode: '',
  trainingCode: '',
  resourcePersonName: '',
  topicDelivered: '',
}

const initialForm = {
  respondentName: '',
  rpCode: '',
  trainingCode: '',
  resourcePersonName: '',
  topicDelivered: '',
  trainingTitle: '',
  deliveryDate: '',
  clarityObjectives: '',
  topicOrganization: '',
  clarityPresentation: '',
  instructionalAidsQuality: '',
  teachingAbility: '',
  questionAnsweringAbility: '',
  participantInterest: '',
  timeManagement: '',
  topicEnding: '',
  overallSatisfaction: '',
  likedAboutRP: '',
  dislikedAboutRP: '',
  otherRemarks: '',
  topicEvaluations: {},
}

const scoreFields = [
  { key: 'clarityObjectives', label: 'Clarity Objectives' },
  { key: 'topicOrganization', label: 'Topic Organization' },
  { key: 'clarityPresentation', label: 'Clarity Presentation' },
  { key: 'instructionalAidsQuality', label: 'Instructional Aids Quality' },
  { key: 'teachingAbility', label: 'Teaching Ability' },
  { key: 'questionAnsweringAbility', label: 'Question Answering Ability' },
  { key: 'participantInterest', label: 'Participant Interest' },
  { key: 'timeManagement', label: 'Time Management' },
  { key: 'topicEnding', label: 'Topic Ending' },
  { key: 'overallSatisfaction', label: 'Overall Satisfaction' },
]

const likertRatings = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Fair' },
  { value: 3, label: 'Satisfactorily' },
  { value: 4, label: 'Very Satisfactorily' },
  { value: 5, label: 'Excellent' },
]

const readValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || ''

const parseTopics = (value = '') =>
  String(value)
    .split(/\r?\n|;/)
    .map((topic) => topic.trim())
    .filter(Boolean)

const parseTopicEvaluations = (value) => {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const normalizeTopicEvaluationMap = (value) =>
  parseTopicEvaluations(value).reduce((items, item) => {
    if (!item.topic) return items

    items[item.topic] = {
      relevance: item.relevance || '',
      timeAllocation: item.timeAllocation || '',
      suggestedTimeAllocation: item.suggestedTimeAllocation || '',
      methodology: item.methodology || '',
      suggestedMethodology: item.suggestedMethodology || '',
    }

    return items
  }, {})

const buildTopicEvaluationPayload = (topicEvaluations = {}, topics = []) =>
  topics.map((topic) => ({
    topic,
    relevance: topicEvaluations[topic]?.relevance || '',
    timeAllocation: topicEvaluations[topic]?.timeAllocation || '',
    suggestedTimeAllocation: topicEvaluations[topic]?.suggestedTimeAllocation || '',
    methodology: topicEvaluations[topic]?.methodology || '',
    suggestedMethodology: topicEvaluations[topic]?.suggestedMethodology || '',
  }))

const topicEvaluationLabels = {
  veryRelevant: 'Very relevant',
  somewhatRelevant: 'Somewhat relevant',
  notRelevant: 'Not at all relevant',
  justRight: 'Just right',
  needImprovement: 'Need improvement',
  effective: 'Effective',
  notEffective: 'Not Effective',
}

const formatTopicEvaluationValue = (value) => topicEvaluationLabels[value] || value || 'Not marked'

const getPublicBatchIdFromUrl = () => {
  if (typeof window === 'undefined') return ''

  return new URLSearchParams(window.location.search).get('evaluate_batch') || ''
}

const buildPublicEvaluationUrl = (batchId) => {
  if (typeof window === 'undefined' || !batchId) return ''

  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('evaluate_batch', batchId)

  return url.toString()
}

const buildQrCodeUrl = (value) =>
  value ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(value)}` : ''

const normalizeEvaluation = (evaluation = {}) => ({
  ...evaluation,
  respondentName: readValue(evaluation.respondentName, evaluation.respondent_name),
  rpCode: readValue(evaluation.rpCode, evaluation.rp_code),
  trainingCode: readValue(evaluation.trainingCode, evaluation.training_code),
  resourcePersonName: readValue(evaluation.resourcePersonName, evaluation.resource_person_name),
  topicDelivered: readValue(evaluation.topicDelivered, evaluation.topic_delivered),
  topicEvaluations: parseTopicEvaluations(readValue(evaluation.topicEvaluations, evaluation.topic_evaluations)),
  trainingTitle: readValue(evaluation.trainingTitle, evaluation.training_title),
  deliveryDate: readValue(evaluation.deliveryDate, evaluation.delivery_date),
})

const normalizeBatch = (batch = {}) => {
  const evaluations = (batch.evaluations || []).map(normalizeEvaluation)
  const detailEvaluation =
    evaluations.find((evaluation) => evaluation.rpCode || evaluation.trainingCode || evaluation.resourcePersonName) || {}

  return {
    ...batch,
    id: batch.id ?? batch.batch_id,
    name: readValue(batch.name, batch.batch_name),
    date: readValue(batch.date, batch.batch_date),
    rpCode: readValue(batch.rpCode, batch.rp_code, batch.batch_rp_code, detailEvaluation.rpCode),
    trainingCode: readValue(
      batch.trainingCode,
      batch.training_code,
      batch.batch_training_code,
      detailEvaluation.trainingCode,
    ),
    resourcePersonName: readValue(
      batch.resourcePersonName,
      batch.resource_person_name,
      batch.batch_resource_person_name,
      detailEvaluation.resourcePersonName,
    ),
    topicDelivered: readValue(
      batch.topicDelivered,
      batch.topic_delivered,
      batch.batch_topic_delivered,
      detailEvaluation.topicDelivered,
    ),
    evaluations,
  }
}

function App() {
  const editBatchRef = useRef(null)
  const pageShellRef = useRef(null)
  const [publicBatchId] = useState(getPublicBatchIdFromUrl)
  const isPublicEvaluation = Boolean(publicBatchId)
  const [currentPage, setCurrentPage] = useState(isPublicEvaluation ? 'evaluation' : 'batches')
  const [batchForm, setBatchForm] = useState(initialBatchForm)
  const [batches, setBatches] = useState([])
  const [activeBatchId, setActiveBatchId] = useState('')
  const [editBatchId, setEditBatchId] = useState('')
  const [editBatchForm, setEditBatchForm] = useState(initialBatchForm)
  const [batchSearch, setBatchSearch] = useState('')
  const [respondentSearch, setRespondentSearch] = useState('')
  const [isLoadingBatches, setIsLoadingBatches] = useState(false)
  const [isCreatingBatch, setIsCreatingBatch] = useState(false)
  const [isUpdatingBatch, setIsUpdatingBatch] = useState(false)
  const [deletingBatchId, setDeletingBatchId] = useState('')
  const [formData, setFormData] = useState(initialForm)
  const [viewEvaluation, setViewEvaluation] = useState(null)
  const [editEvaluationId, setEditEvaluationId] = useState('')
  const [editFormData, setEditFormData] = useState(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [deletingEvaluationId, setDeletingEvaluationId] = useState('')
  const [importedBatch, setImportedBatch] = useState(null)
  const [isImportingExcel, setIsImportingExcel] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusType, setStatusType] = useState('idle')

  const activeBatch = useMemo(
    () => batches.find((batch) => String(batch.id) === activeBatchId),
    [activeBatchId, batches],
  )

  const publicEvaluationUrl = useMemo(() => buildPublicEvaluationUrl(activeBatch?.id), [activeBatch])
  const publicEvaluationQrUrl = useMemo(() => buildQrCodeUrl(publicEvaluationUrl), [publicEvaluationUrl])

  const activeTopics = useMemo(() => parseTopics(activeBatch?.topicDelivered), [activeBatch])

  const filteredBatches = useMemo(() => {
    const searchTerm = batchSearch.trim().toLowerCase()

    if (!searchTerm) return batches

    return batches.filter((batch) =>
      [
        batch.name,
        batch.date,
        batch.rpCode,
        batch.trainingCode,
        batch.resourcePersonName,
        batch.topicDelivered,
        String(batch.id),
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchTerm),
    )
  }, [batchSearch, batches])

  const filteredEvaluations = useMemo(() => {
    const evaluations = activeBatch?.evaluations || []
    const searchTerm = respondentSearch.trim().toLowerCase()

    if (!searchTerm) return evaluations

    return evaluations.filter((evaluation) => evaluation.respondentName.toLowerCase().includes(searchTerm))
  }, [activeBatch, respondentSearch])

  const likertSummary = useMemo(() => {
    return scoreFields.map((field) => {
      const counts = likertRatings.reduce((ratingCounts, rating) => {
        ratingCounts[rating.value] = 0
        return ratingCounts
      }, {})

      filteredEvaluations.forEach((evaluation) => {
        const value = Number(evaluation[field.key])

        if (counts[value] !== undefined) {
          counts[value] += 1
        }
      })

      return {
        ...field,
        counts,
        total: filteredEvaluations.length,
      }
    })
  }, [filteredEvaluations])

  const likertAverages = useMemo(() => {
    const averages = {}

    likertRatings.forEach((rating) => {
      const totalPercentage = likertSummary.reduce((sum, field) => {
        const percentage = field.total ? (field.counts[rating.value] / field.total) * 100 : 0
        return sum + percentage
      }, 0)

      averages[rating.value] = likertSummary.length ? totalPercentage / likertSummary.length : 0
    })

    return averages
  }, [likertSummary])

  const formatPercentage = (value) => {
    if (!value) return ''

    return `${value.toFixed(2)}%`
  }

  const calculateAverageScore = (evaluation) => {
    const values = scoreFields
      .map((field) => Number(evaluation[field.key]))
      .filter((value) => Number.isFinite(value) && value > 0)

    if (!values.length) return 0

    return (values.reduce((total, value) => total + value, 0) / values.length).toFixed(2)
  }

  const buildEvaluationPayload = (data, batchId) => ({
    batch_id: batchId,
    batch_name: activeBatch?.name || '',
    batch_date: activeBatch?.date || '',
    respondent_name: data.respondentName,
    rp_code: activeBatch?.rpCode || data.rpCode,
    training_code: activeBatch?.trainingCode || data.trainingCode,
    resource_person_name: activeBatch?.resourcePersonName || data.resourcePersonName,
    topic_delivered: activeBatch?.topicDelivered || data.topicDelivered,
    topic_evaluations: buildTopicEvaluationPayload(data.topicEvaluations, activeTopics),
    training_title: activeBatch?.name || data.trainingTitle,
    delivery_date: activeBatch?.date || data.deliveryDate,
    clarity_objectives: Number(data.clarityObjectives),
    topic_organization: Number(data.topicOrganization),
    clarity_presentation: Number(data.clarityPresentation),
    instructional_aids_quality: Number(data.instructionalAidsQuality),
    teaching_ability: Number(data.teachingAbility),
    question_answering_ability: Number(data.questionAnsweringAbility),
    participant_interest: Number(data.participantInterest),
    time_management: Number(data.timeManagement),
    topic_ending: Number(data.topicEnding),
    overall_satisfaction: Number(data.overallSatisfaction),
    liked_about_rp: data.likedAboutRP,
    disliked_about_rp: data.dislikedAboutRP,
    other_remarks: data.otherRemarks,
  })

  const loadBatches = async () => {
    setIsLoadingBatches(true)

    try {
      const response = await fetch(`${API_BASE_URL}/batches.php`, {
        headers: {
          Accept: 'application/json',
        },
      })
      const body = await response.json()

      if (!response.ok || !body.success) {
        throw new Error(body.message || 'Unable to load batches.')
      }

      const normalizedBatches = (body.batches || []).map(normalizeBatch)

      setBatches(normalizedBatches)
      setActiveBatchId((current) => {
        if (isPublicEvaluation) {
          return normalizedBatches.some((batch) => String(batch.id) === String(publicBatchId))
            ? String(publicBatchId)
            : ''
        }

        if (current && normalizedBatches.some((batch) => String(batch.id) === current)) {
          return current
        }

        return normalizedBatches[0] ? String(normalizedBatches[0].id) : ''
      })

      if (isPublicEvaluation) {
        const publicBatch = normalizedBatches.find((batch) => String(batch.id) === String(publicBatchId))

        if (publicBatch) {
          setCurrentPage('evaluation')
          setFormData((current) => ({
            ...current,
            rpCode: publicBatch.rpCode || '',
            trainingCode: publicBatch.trainingCode || '',
            resourcePersonName: publicBatch.resourcePersonName || '',
            topicDelivered: publicBatch.topicDelivered || '',
            trainingTitle: publicBatch.name || '',
            deliveryDate: publicBatch.date || '',
          }))
        } else {
          setStatusType('error')
          setStatusMessage('This evaluation link is invalid or the batch is no longer available.')
        }
      }
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to load batches from the database.')
    } finally {
      setIsLoadingBatches(false)
    }
  }

  useEffect(() => {
    loadBatches()
  }, [])

  const handleBatchChange = (event) => {
    const { name, value } = event.target

    setBatchForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const scrollToPageTop = () => {
    window.requestAnimationFrame(() => {
      pageShellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleEditBatchChange = (event) => {
    const { name, value } = event.target

    setEditBatchForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleBatchSubmit = async (event) => {
    event.preventDefault()

    if (isCreatingBatch) return

    const nextBatch = {
      name: batchForm.name.trim(),
      date: batchForm.date,
      rpCode: batchForm.rpCode.trim(),
      trainingCode: batchForm.trainingCode.trim(),
      resourcePersonName: batchForm.resourcePersonName.trim(),
      topicDelivered: batchForm.topicDelivered.trim(),
    }

    if (
      !nextBatch.name ||
      !nextBatch.date ||
      !nextBatch.rpCode ||
      !nextBatch.trainingCode ||
      !nextBatch.resourcePersonName ||
      !nextBatch.topicDelivered
    ) {
      setStatusType('error')
      setStatusMessage(
        'Enter the batch name, date, RP code, training code, resource person, and topic/s delivered before creating a batch.',
      )
      return
    }

    setIsCreatingBatch(true)
    setStatusType('idle')
    setStatusMessage('Creating batch in MySQL...')

    try {
      const response = await fetch(`${API_BASE_URL}/batches.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: nextBatch.name,
          date: nextBatch.date,
          rp_code: nextBatch.rpCode,
          training_code: nextBatch.trainingCode,
          resource_person_name: nextBatch.resourcePersonName,
          topic_delivered: nextBatch.topicDelivered,
        }),
      })
      const body = await response.json()

      if (!response.ok || !body.success) {
        throw new Error(body.message || 'Unable to create batch.')
      }

      const newBatch = normalizeBatch(body.batch)

      setBatches((current) => [newBatch, ...current])
      setActiveBatchId(String(newBatch.id))
      setBatchForm(initialBatchForm)
      setStatusType('success')
      setStatusMessage('Batch created in the database.')
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to create batch in the database.')
    } finally {
      setIsCreatingBatch(false)
    }
  }

  const openBatchEvaluation = (batchId) => {
    if (isPublicEvaluation) return

    const selectedBatch = batches.find((batch) => String(batch.id) === String(batchId))

    setActiveBatchId(String(batchId))
    setFormData((current) => ({
      ...current,
      rpCode: selectedBatch?.rpCode || '',
      trainingCode: selectedBatch?.trainingCode || '',
      resourcePersonName: selectedBatch?.resourcePersonName || '',
      topicDelivered: selectedBatch?.topicDelivered || '',
      trainingTitle: selectedBatch?.name || '',
      deliveryDate: selectedBatch?.date || '',
    }))
    setStatusType('idle')
    setStatusMessage('')
    setCurrentPage('evaluation')
  }

  const startEditBatch = (batch) => {
    setEditBatchId(String(batch.id))
    setEditBatchForm({
      name: batch.name,
      date: batch.date,
      rpCode: batch.rpCode || '',
      trainingCode: batch.trainingCode || '',
      resourcePersonName: batch.resourcePersonName || '',
      topicDelivered: batch.topicDelivered || '',
    })
    setStatusType('idle')
    setStatusMessage('')
    window.setTimeout(() => {
      editBatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      editBatchRef.current?.querySelector('input')?.focus()
    }, 0)
  }

  const cancelEditBatch = () => {
    setEditBatchId('')
    setEditBatchForm(initialBatchForm)
    setIsUpdatingBatch(false)
  }

  const handleUpdateBatch = async (event) => {
    event.preventDefault()

    if (isUpdatingBatch || !editBatchId) return

    setIsUpdatingBatch(true)
    setStatusType('idle')
    setStatusMessage('Updating batch...')

    try {
      const response = await fetch(`${API_BASE_URL}/batches.php`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          id: Number(editBatchId),
          name: editBatchForm.name.trim(),
          date: editBatchForm.date,
          rp_code: editBatchForm.rpCode.trim(),
          training_code: editBatchForm.trainingCode.trim(),
          resource_person_name: editBatchForm.resourcePersonName.trim(),
          topic_delivered: editBatchForm.topicDelivered.trim(),
        }),
      })
      const body = await response.json()

      if (!response.ok || !body.success) {
        throw new Error(body.message || 'Unable to update batch.')
      }

      const updatedBatch = normalizeBatch(body.batch)

      setBatches((current) =>
        current.map((batch) =>
          String(batch.id) === editBatchId
            ? {
                ...batch,
                name: updatedBatch.name,
                date: updatedBatch.date,
                rpCode: updatedBatch.rpCode,
                trainingCode: updatedBatch.trainingCode,
                resourcePersonName: updatedBatch.resourcePersonName,
                topicDelivered: updatedBatch.topicDelivered,
              }
            : batch,
        ),
      )
      cancelEditBatch()
      setStatusType('success')
      setStatusMessage(body.message || 'Batch updated successfully.')
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to update batch.')
    } finally {
      setIsUpdatingBatch(false)
    }
  }

  const handleDeleteBatch = async (batch) => {
    if (deletingBatchId) return

    const confirmed = window.confirm(
      `Are you sure you want to delete this batch?\n\n${batch.name} (${batch.date})\n\nThis will permanently delete all ${batch.evaluations.length} evaluation entries under this batch.`,
    )

    if (!confirmed) return

    setDeletingBatchId(String(batch.id))
    setStatusType('idle')
    setStatusMessage('Deleting batch and its entries...')

    try {
      const response = await fetch(`${API_BASE_URL}/batches.php`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          id: batch.id,
        }),
      })
      const body = await response.json()

      if (!response.ok || !body.success) {
        throw new Error(body.message || 'Unable to delete batch.')
      }

      setBatches((current) => current.filter((item) => item.id !== batch.id))

      if (String(batch.id) === activeBatchId) {
        setActiveBatchId('')
        setCurrentPage('batches')
      }

      if (String(batch.id) === editBatchId) {
        cancelEditBatch()
      }

      setStatusType('success')
      setStatusMessage(body.message || 'Batch and entries deleted successfully.')
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to delete batch.')
    } finally {
      setDeletingBatchId('')
    }
  }

  const openBatchEntries = (batchId) => {
    setActiveBatchId(String(batchId))
    setRespondentSearch('')
    setStatusType('idle')
    setStatusMessage('')
    setCurrentPage('entries')
  }

  const handleChange = (event) => {
    const { name, value } = event.target

    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleTopicEvaluationChange = (topic, field, value) => {
    setFormData((current) => ({
      ...current,
      topicEvaluations: {
        ...current.topicEvaluations,
        [topic]: {
          ...(current.topicEvaluations[topic] || {}),
          [field]: value,
        },
      },
    }))
  }

  const validateTopicEvaluations = (data) => {
    for (const topic of activeTopics) {
      const item = data.topicEvaluations[topic] || {}

      if (!item.relevance || !item.timeAllocation || !item.methodology) {
        return `Complete the topic evaluation for "${topic}".`
      }

      if (item.timeAllocation === 'needImprovement' && !item.suggestedTimeAllocation?.trim()) {
        return `Enter the suggested time allocation for "${topic}".`
      }

      if (item.methodology === 'notEffective' && !item.suggestedMethodology?.trim()) {
        return `Enter the suggested methodology for "${topic}".`
      }
    }

    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (isSaving) return

    if (!activeBatch) {
      setStatusType('error')
      setStatusMessage(
        isPublicEvaluation
          ? 'This evaluation link is invalid or the batch is no longer available.'
          : 'Select a batch before submitting an evaluation.',
      )

      if (!isPublicEvaluation) {
        setCurrentPage('batches')
      }

      return
    }

    const topicError = validateTopicEvaluations(formData)

    if (topicError) {
      setStatusType('error')
      setStatusMessage(topicError)
      return
    }

    setIsSaving(true)
    setStatusType('idle')
    setStatusMessage('Saving evaluation to Laragon MySQL...')

    try {
      const response = await fetch(`${API_BASE_URL}/save.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          ...buildEvaluationPayload(formData, activeBatch.id),
        }),
      })
      const body = await response.json()

      if (!response.ok || !body.success) {
        throw new Error(body.message || 'Unable to save the evaluation right now.')
      }

      const savedEvaluation =
        body.evaluation || {
          id: body.id || crypto.randomUUID(),
          ...formData,
          averageScore: calculateAverageScore(formData),
          submittedAt: new Date().toISOString(),
        }
      const normalizedEvaluation = normalizeEvaluation(savedEvaluation)

      setBatches((current) =>
        current.map((batch) =>
          String(batch.id) === activeBatchId
            ? {
                ...batch,
                rpCode: readValue(batch.rpCode, normalizedEvaluation.rpCode),
                trainingCode: readValue(batch.trainingCode, normalizedEvaluation.trainingCode),
                resourcePersonName: readValue(batch.resourcePersonName, normalizedEvaluation.resourcePersonName),
                topicDelivered: readValue(batch.topicDelivered, normalizedEvaluation.topicDelivered),
                evaluations: [normalizedEvaluation, ...batch.evaluations],
              }
            : batch,
        ),
      )
      setFormData({
        ...initialForm,
        rpCode: activeBatch.rpCode || '',
        trainingCode: activeBatch.trainingCode || '',
        resourcePersonName: activeBatch.resourcePersonName || '',
        topicDelivered: activeBatch.topicDelivered || '',
        topicEvaluations: {},
        trainingTitle: activeBatch.name || '',
        deliveryDate: activeBatch.date || '',
      })
      setStatusType('success')
      setStatusMessage(body.message || 'Evaluation saved and listed inside the selected batch.')
      scrollToPageTop()
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'An unexpected error occurred while saving the form.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setFormData({
      ...initialForm,
      rpCode: activeBatch?.rpCode || '',
      trainingCode: activeBatch?.trainingCode || '',
      resourcePersonName: activeBatch?.resourcePersonName || '',
      topicDelivered: activeBatch?.topicDelivered || '',
      topicEvaluations: {},
      trainingTitle: activeBatch?.name || '',
      deliveryDate: activeBatch?.date || '',
    })
    setIsSaving(false)
    setStatusType('idle')
    setStatusMessage('')
  }

  const handleCopyPublicEvaluationLink = async () => {
    if (!publicEvaluationUrl) return

    try {
      await navigator.clipboard.writeText(publicEvaluationUrl)
      setStatusType('success')
      setStatusMessage('Public evaluation link copied.')
    } catch {
      setStatusType('error')
      setStatusMessage('Copy failed. Select and copy the link manually.')
    }
  }

  const startEditEvaluation = (evaluation) => {
    setViewEvaluation(null)
    setEditEvaluationId(String(evaluation.id))
    setEditFormData({
      ...initialForm,
      ...evaluation,
      topicEvaluations: normalizeTopicEvaluationMap(evaluation.topicEvaluations),
    })
    setStatusType('idle')
    setStatusMessage('')
  }

  const cancelEditEvaluation = () => {
    setEditEvaluationId('')
    setEditFormData(initialForm)
    setIsUpdating(false)
  }

  const startViewEvaluation = (evaluation) => {
    setEditEvaluationId('')
    setEditFormData(initialForm)
    setViewEvaluation(evaluation)
    setStatusType('idle')
    setStatusMessage('')
    scrollToPageTop()
  }

  const closeViewEvaluation = () => {
    setViewEvaluation(null)
  }

  const handleEditChange = (event) => {
    const { name, value } = event.target

    setEditFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleEditTopicEvaluationChange = (topic, field, value) => {
    setEditFormData((current) => ({
      ...current,
      topicEvaluations: {
        ...current.topicEvaluations,
        [topic]: {
          ...(current.topicEvaluations[topic] || {}),
          [field]: value,
        },
      },
    }))
  }

  const handleUpdateEvaluation = async (event) => {
    event.preventDefault()

    if (isUpdating || !activeBatch || !editEvaluationId) return

    setIsUpdating(true)
    setStatusType('idle')
    setStatusMessage('Updating evaluation...')

    try {
      const topicError = validateTopicEvaluations(editFormData)

      if (topicError) {
        throw new Error(topicError)
      }

      const response = await fetch(`${API_BASE_URL}/evaluations.php`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          id: Number(editEvaluationId),
          ...buildEvaluationPayload(editFormData, activeBatch.id),
        }),
      })
      const body = await response.json()

      if (!response.ok || !body.success) {
        throw new Error(body.message || 'Unable to update evaluation.')
      }

      setBatches((current) =>
        current.map((batch) =>
          String(batch.id) === activeBatchId
            ? {
                ...batch,
                evaluations: batch.evaluations.map((evaluation) =>
                  String(evaluation.id) === editEvaluationId
                    ? {
                        ...evaluation,
                        ...normalizeEvaluation(body.evaluation),
                      }
                    : evaluation,
                ),
              }
            : batch,
        ),
      )
      cancelEditEvaluation()
      setStatusType('success')
      setStatusMessage(body.message || 'Evaluation updated successfully.')
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to update evaluation.')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDeleteEvaluation = async (evaluation) => {
    if (!activeBatch || deletingEvaluationId) return

    const confirmed = window.confirm(`Delete evaluation for ${evaluation.respondentName}?`)

    if (!confirmed) return

    setDeletingEvaluationId(String(evaluation.id))
    setStatusType('idle')
    setStatusMessage('Deleting evaluation...')

    try {
      const response = await fetch(`${API_BASE_URL}/evaluations.php`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          id: evaluation.id,
          batch_id: activeBatch.id,
        }),
      })
      const body = await response.json()

      if (!response.ok || !body.success) {
        throw new Error(body.message || 'Unable to delete evaluation.')
      }

      setBatches((current) =>
        current.map((batch) =>
          String(batch.id) === activeBatchId
            ? {
                ...batch,
                evaluations: batch.evaluations.filter((item) => item.id !== evaluation.id),
              }
            : batch,
        ),
      )

      if (String(evaluation.id) === editEvaluationId) {
        cancelEditEvaluation()
      }

      if (viewEvaluation?.id === evaluation.id) {
        closeViewEvaluation()
      }

      setStatusType('success')
      setStatusMessage(body.message || 'Evaluation deleted successfully.')
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to delete evaluation.')
    } finally {
      setDeletingEvaluationId('')
    }
  }

  const renderTopicEvaluationTable = (data, onChange, namePrefix, disabled = false) => {
    if (!activeTopics.length) return null

    return (
      <section className="topic-evaluation-section">
        <div className="section-heading">
          <h3>Lesson / Topic Evaluation</h3>
          <p>Mark the relevance, time allocation, and methodology used for each topic.</p>
        </div>

        <div className="entries-table-wrap">
          <table className="topic-evaluation-table">
            <thead>
              <tr>
                <th rowSpan="2">Topic/s Discussed</th>
                <th colSpan="3">Relevance</th>
                <th colSpan="3">Time Allocation</th>
                <th colSpan="3">Methodology Used</th>
              </tr>
              <tr>
                <th>Very relevant</th>
                <th>Somewhat relevant</th>
                <th>Not at all relevant</th>
                <th>Just right</th>
                <th>Need improvement</th>
                <th>Suggested time allocation</th>
                <th>Effective</th>
                <th>Not Effective</th>
                <th>Suggested methodology</th>
              </tr>
            </thead>
            <tbody>
              {activeTopics.map((topic) => {
                const item = data.topicEvaluations[topic] || {}

                return (
                  <tr key={topic}>
                    <td className="topic-name">{topic}</td>
                    {[
                      ['veryRelevant', 'relevance'],
                      ['somewhatRelevant', 'relevance'],
                      ['notRelevant', 'relevance'],
                    ].map(([value, field]) => (
                      <td key={value}>
                        <input
                          type="radio"
                          name={`${namePrefix}-${topic}-${field}`}
                          checked={item[field] === value}
                          onChange={() => onChange(topic, field, value)}
                          disabled={disabled}
                          required
                        />
                      </td>
                    ))}
                    {[
                      ['justRight', 'timeAllocation'],
                      ['needImprovement', 'timeAllocation'],
                    ].map(([value, field]) => (
                      <td key={value}>
                        <input
                          type="radio"
                          name={`${namePrefix}-${topic}-${field}`}
                          checked={item[field] === value}
                          onChange={() => onChange(topic, field, value)}
                          disabled={disabled}
                          required
                        />
                      </td>
                    ))}
                    <td>
                      <textarea
                        rows="2"
                        value={item.suggestedTimeAllocation || ''}
                        onChange={(event) => onChange(topic, 'suggestedTimeAllocation', event.target.value)}
                        disabled={disabled || item.timeAllocation !== 'needImprovement'}
                        required={item.timeAllocation === 'needImprovement'}
                      />
                    </td>
                    {[
                      ['effective', 'methodology'],
                      ['notEffective', 'methodology'],
                    ].map(([value, field]) => (
                      <td key={value}>
                        <input
                          type="radio"
                          name={`${namePrefix}-${topic}-${field}`}
                          checked={item[field] === value}
                          onChange={() => onChange(topic, field, value)}
                          disabled={disabled}
                          required
                        />
                      </td>
                    ))}
                    <td>
                      <textarea
                        rows="2"
                        value={item.suggestedMethodology || ''}
                        onChange={(event) => onChange(topic, 'suggestedMethodology', event.target.value)}
                        disabled={disabled || item.methodology !== 'notEffective'}
                        required={item.methodology === 'notEffective'}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  const handleExportEvaluationForm = async () => {
    if (!activeBatch && !viewEvaluation) {
      setStatusType('error')
      setStatusMessage('Select a batch or evaluation before exporting the form.')
      return
    }

    try {
      setStatusType('idle')
      setStatusMessage('Generating evaluation form...')
      await exportEvaluationFormDocx(viewEvaluation || { ...activeBatch, ...formData }, activeBatch || {})
      setStatusType('success')
      setStatusMessage('Evaluation form exported to Word.')
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to export the evaluation form.')
    }
  }

  const renderPrintForm = (source = {}) => {
    const {
      respondentName = '',
      resourcePersonName = '',
      trainingTitle = '',
      deliveryDate = '',
      topicDelivered = '',
      rpCode = '',
      trainingCode = '',
      likedAboutRP = '',
      dislikedAboutRP = '',
      otherRemarks = '',
      topicEvaluations = {},
    } = source

    const scoreRows = [
      { key: 'clarityObjectives', label: 'a. Clarity of the topic objectives at the beginning' },
      { key: 'topicOrganization', label: 'b. Organization/sequencing of topic' },
      { key: 'clarityPresentation', label: 'c. Clarity of topic/ideas presented/discussed' },
      { key: 'instructionalAidsQuality', label: 'd. Quality and effectiveness of instructional aids used' },
      { key: 'teachingAbility', label: 'e. Ability to teach/communicate ideas' },
      { key: 'questionAnsweringAbility', label: 'f. Ability to answer questions' },
      { key: 'participantInterest', label: 'g. Ability to arouse/sustain interest' },
      { key: 'timeManagement', label: 'h. Ability to manage time' },
      { key: 'topicEnding', label: 'i. How the topic was ended' },
      { key: 'overallSatisfaction', label: 'j. Overall level of satisfaction' },
    ]

    const rows = Array.isArray(topicEvaluations)
      ? topicEvaluations
      : Object.entries(topicEvaluations || {}).map(([topic, item]) => ({ topic, ...item }))

    const printRows = rows.length
      ? rows
      : Array.from({ length: 3 }).map((_, index) => ({
          topic: index === 0 ? topicDelivered : '',
          relevance: '',
          timeAllocation: '',
          suggestedTimeAllocation: '',
          methodology: '',
          suggestedMethodology: '',
        }))

    const mark = (value, expected) => (value === expected ? '✔' : '')

    return (
      <section className="print-sheet" aria-hidden="true">
        <div className="print-header">
          <div className="print-logo">
            <img src={atiLogo} alt="ATI logo" />
          </div>
          <div className="print-header-copy">
            <div>Republic of the Philippines</div>
            <div>Department of Agriculture</div>
            <div className="print-header-title">AGRICULTURAL TRAINING INSTITUTE</div>
            <div>ATI Building, Elliptical Road, Diliman, Quezon City, Metro Manila 1100</div>
            <div>Tel. Nos. (632) 892-9541 to 49 • (632) 927-8797 • Fax No. (632) 892-9752</div>
            <div>Website: http://www.ati.da.gov.ph • Email: ati@ati.da.gov.ph</div>
          </div>
        </div>

        <div className="print-title-row">
          <div>
            <div className="print-small-label">Name of Participant (optional):</div>
            <div className="print-fill-line">{respondentName || '\u00A0'}</div>
          </div>
          <div>
            <div className="print-small-label">Resource Person:</div>
            <div className="print-fill-line">{resourcePersonName || '\u00A0'}</div>
          </div>
          <div>
            <div className="print-small-label">Title of Training/Activity:</div>
            <div className="print-fill-line">{trainingTitle || '\u00A0'}</div>
          </div>
          <div>
            <div className="print-small-label">Date of Delivery:</div>
            <div className="print-fill-line">{deliveryDate || '\u00A0'}</div>
          </div>
        </div>

        <p className="print-instruction">
          Instruction: Please provide an honest assessment on the following:
        </p>
        <p className="print-note">
          1. Relevance, time allocation, and effectiveness of the methodology used by the resource person to discuss the lesson/topic. (Put a check mark and provide suggestions)
        </p>

        <div className="print-table-wrap">
          <table className="print-topic-table">
            <thead>
              <tr>
                <th rowSpan="2">Topic/s Discussed<br />(include duration/topic)</th>
                <th colSpan="3">Relevance</th>
                <th colSpan="3">Time Allocation</th>
                <th colSpan="3">Methodology Used</th>
              </tr>
              <tr>
                <th>Very<br />relevant</th>
                <th>Somewhat<br />relevant</th>
                <th>Not at all<br />relevant</th>
                <th>Just<br />right</th>
                <th>Need<br />improvement</th>
                <th>Suggested<br />time allocation</th>
                <th>Effective</th>
                <th>Not<br />Effective</th>
                <th>Suggested<br />methodology</th>
              </tr>
            </thead>
            <tbody>
              {printRows.map((row, index) => (
                <tr key={index}>
                  <td className="topic-name">{row.topic || ''}</td>
                  <td>{mark(row.relevance, 'veryRelevant')}</td>
                  <td>{mark(row.relevance, 'somewhatRelevant')}</td>
                  <td>{mark(row.relevance, 'notRelevant')}</td>
                  <td>{mark(row.timeAllocation, 'justRight')}</td>
                  <td>{mark(row.timeAllocation, 'needImprovement')}</td>
                  <td>{row.suggestedTimeAllocation || ''}</td>
                  <td>{mark(row.methodology, 'effective')}</td>
                  <td>{mark(row.methodology, 'notEffective')}</td>
                  <td>{row.suggestedMethodology || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="print-table-wrap likert-print">
          <table className="print-likert-table">
            <thead>
              <tr>
                <th>Criteria</th>
                {['1', '2', '3', '4', '5'].map((value) => (
                  <th key={value}>{value}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scoreRows.map((field) => (
                <tr key={field.key}>
                  <td>{field.label}</td>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <td key={value}>
                      {String(source[field.key]) === String(value) ? '✔' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="print-remarks-grid">
          <div>
            <span>What did you like about the resource person?</span>
            <div className="print-remark-box">{likedAboutRP || '\u00A0'}</div>
          </div>
          <div>
            <span>What did you not like about the resource person?</span>
            <div className="print-remark-box">{dislikedAboutRP || '\u00A0'}</div>
          </div>
          <div>
            <span>Other remarks</span>
            <div className="print-remark-box">{otherRemarks || '\u00A0'}</div>
          </div>
        </div>

        <div className="print-footer">
          <span>ATI-QF/CDMD-03</span>
          <span>Rev. 04</span>
          <span>Effectivity Date: November 26, 2024</span>
        </div>
      </section>
    )
  }

  const handleExportExcel = () => {
    if (!activeBatch) {
      setStatusType('error')
      setStatusMessage('Choose a batch before exporting.')
      return
    }

    window.location.href = `${API_BASE_URL}/export.php?batch_id=${activeBatch.id}`
  }

  const handleExportWord = async () => {
    if (!activeBatch) {
      setStatusType('error')
      setStatusMessage('Choose a batch before exporting.')
      return
    }

    if (!activeBatch.evaluations?.length) {
      setStatusType('error')
      setStatusMessage('Add at least one evaluation entry before exporting the Word report.')
      return
    }

    try {
      setStatusType('idle')
      setStatusMessage('Generating MS Word document...')
      await exportEvaluationReportDocx(activeBatch)
      setStatusType('success')
      setStatusMessage('MS Word document exported.')
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to export the MS Word document.')
    }
  }

  const handleImportExcel = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    try {
      setIsImportingExcel(true)
      setStatusType('idle')
      setStatusMessage('Reading Criteria_Assessment from Excel...')
      const imported = await importCriteriaAssessmentWorkbook(file)
      setImportedBatch(imported)
      setStatusType('success')
      setStatusMessage(`Imported ${imported.evaluations.length} evaluation rows from ${file.name}.`)
    } catch (error) {
      setImportedBatch(null)
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to import the Excel workbook.')
    } finally {
      setIsImportingExcel(false)
    }
  }

  const handleExportImportedWord = async () => {
    if (!importedBatch?.evaluations?.length) {
      setStatusType('error')
      setStatusMessage('Import an Excel file before generating the Word document.')
      return
    }

    try {
      setStatusType('idle')
      setStatusMessage('Generating Word document from imported Excel data...')
      await exportEvaluationReportDocx(importedBatch)
      setStatusType('success')
      setStatusMessage('Imported Excel data exported to Word.')
    } catch (error) {
      setStatusType('error')
      setStatusMessage(error.message || 'Unable to export imported Excel data to Word.')
    }
  }

  return (
    <div className={isPublicEvaluation ? 'app-shell public-app-shell' : 'app-shell'}>
      {!isPublicEvaluation ? (
      <aside className="nav-panel">
        <div>
          <p className="eyebrow">ARRPE</p>
          <h1>TMIS</h1>
        </div>

        <nav className="nav-links" aria-label="Main navigation">
          <button
            type="button"
            className={currentPage === 'batches' ? 'active' : ''}
            onClick={() => setCurrentPage('batches')}
          >
            Batches
          </button>
          <button
            type="button"
            className={currentPage === 'entries' ? 'active' : ''}
            onClick={() => setCurrentPage('entries')}
          >
            Evaluation Entries
          </button>
          <button
            type="button"
            className={currentPage === 'import' ? 'active' : ''}
            onClick={() => setCurrentPage('import')}
          >
            Import Excel
          </button>
        </nav>

        <div className="nav-context">
          <span>Selected Batch</span>
          <strong>{activeBatch?.name || 'None selected'}</strong>
          {activeBatch ? <small>{activeBatch.date}</small> : null}
        </div>
      </aside>
      ) : null}

      <main ref={pageShellRef} className={isPublicEvaluation ? 'page-shell public-page-shell' : 'page-shell'}>
        {!isPublicEvaluation ? (
        <header className="page-header">
          <div>
            <h2>
              {currentPage === 'batches'
                ? 'Batch Management'
                : currentPage === 'evaluation'
                  ? `Create Evaluation Under ${activeBatch?.name || 'Selected Batch'}`
                  : currentPage === 'import'
                    ? 'Import Excel'
                  : 'Batch Evaluation Entries'}
            </h2>
            <p>
              {currentPage === 'batches'
                ? 'Create batches, search existing batches, and choose where evaluations should be added.'
                : currentPage === 'evaluation'
                  ? activeBatch
                    ? `This evaluation will be saved directly under ${activeBatch.name} (${activeBatch.date}).`
                    : 'Choose a batch from the batch table before creating an evaluation.'
                  : currentPage === 'import'
                    ? 'Read the Criteria_Assessment tab from an Excel workbook and generate the Word evaluation report.'
                  : 'Review the evaluations saved under the selected batch.'}
            </p>
          </div>

          <button type="button" className="secondary" onClick={loadBatches} disabled={isLoadingBatches}>
            {isLoadingBatches ? 'Refreshing...' : 'Refresh'}
          </button>
        </header>
        ) : null}

        {statusMessage ? (
          <p className={`status-message ${statusType}`}>{statusMessage}</p>
        ) : null}

        {currentPage === 'batches' ? (
          <section className="page-stack">
            <form onSubmit={handleBatchSubmit} className="panel batch-form">
              <div className="section-heading">
                <h3>Create Batch</h3>
                <p>New batches are inserted into the MySQL tmis_batches table.</p>
              </div>

              <label>
                Training Title / Batch Name
                <input
                  name="name"
                  value={batchForm.name}
                  onChange={handleBatchChange}
                  placeholder="Example: May 2026 RP Evaluation"
                  required
                />
              </label>

              <label>
                Delivery Date / Batch Date
                <input
                  type="date"
                  name="date"
                  value={batchForm.date}
                  onChange={handleBatchChange}
                  required
                />
              </label>

              <label>
                RP Code
                <input
                  name="rpCode"
                  value={batchForm.rpCode}
                  onChange={handleBatchChange}
                  placeholder="RP-001"
                  required
                />
              </label>

              <label>
                Training Code
                <input
                  name="trainingCode"
                  value={batchForm.trainingCode}
                  onChange={handleBatchChange}
                  placeholder="TR-100"
                  required
                />
              </label>

              <label>
                Resource Person Name
                <input
                  name="resourcePersonName"
                  value={batchForm.resourcePersonName}
                  onChange={handleBatchChange}
                  placeholder="Enter resource person"
                  required
                />
              </label>

              <label className="full-width">
                Topic/s Delivered
                <textarea
                  name="topicDelivered"
                  rows="3"
                  value={batchForm.topicDelivered}
                  onChange={handleBatchChange}
                  placeholder="Write the modules or topics discussed by the resource person"
                  required
                />
              </label>

              <button type="submit" disabled={isCreatingBatch}>
                {isCreatingBatch ? 'Creating...' : 'Create Batch'}
              </button>
            </form>

            <section className="panel">
              <div className="table-toolbar">
                <div className="section-heading">
                  <h3>Batch List</h3>
                  <p>{filteredBatches.length} batch records found</p>
                </div>

                <label className="search-field">
                  Search
                  <input
                    type="search"
                    value={batchSearch}
                    onChange={(event) => setBatchSearch(event.target.value)}
                    placeholder="Search name, date, or ID"
                    disabled={isLoadingBatches || !batches.length}
                  />
                </label>
              </div>

              {editBatchId ? (
                <form ref={editBatchRef} onSubmit={handleUpdateBatch} className="edit-panel">
                  <div className="section-heading">
                    <h3>Edit Batch</h3>
                    <p>Updating batch #{editBatchId}. Existing entries will stay under this batch.</p>
                  </div>

                  <div className="batch-form compact-form">
                    <label>
                      Training Title / Batch Name
                      <input
                        name="name"
                        value={editBatchForm.name}
                        onChange={handleEditBatchChange}
                        required
                      />
                    </label>

                    <label>
                      Delivery Date / Batch Date
                      <input
                        type="date"
                        name="date"
                        value={editBatchForm.date}
                        onChange={handleEditBatchChange}
                        required
                      />
                    </label>

                    <label>
                      RP Code
                      <input
                        name="rpCode"
                        value={editBatchForm.rpCode}
                        onChange={handleEditBatchChange}
                        required
                      />
                    </label>

                    <label>
                      Training Code
                      <input
                        name="trainingCode"
                        value={editBatchForm.trainingCode}
                        onChange={handleEditBatchChange}
                        required
                      />
                    </label>

                    <label>
                      Resource Person Name
                      <input
                        name="resourcePersonName"
                        value={editBatchForm.resourcePersonName}
                        onChange={handleEditBatchChange}
                        required
                      />
                    </label>

                    <label className="full-width">
                      Topic/s Delivered
                      <textarea
                        name="topicDelivered"
                        rows="3"
                        value={editBatchForm.topicDelivered}
                        onChange={handleEditBatchChange}
                        required
                      />
                    </label>

                    <div className="actions">
                      <button type="submit" disabled={isUpdatingBatch}>
                        {isUpdatingBatch ? 'Updating...' : 'Save Batch'}
                      </button>
                      <button type="button" className="secondary" onClick={cancelEditBatch} disabled={isUpdatingBatch}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

              {filteredBatches.length ? (
                <div className="entries-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Training Title / Batch Name</th>
                        <th>Date</th>
                        <th>RP Code</th>
                        <th>Training Code</th>
                        <th>Resource Person</th>
                        <th>Entries</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatches.map((batch) => (
                        <tr
                          key={batch.id}
                          className={
                            String(batch.id) === editBatchId || String(batch.id) === activeBatchId
                              ? 'selected-row'
                              : ''
                          }
                        >
                          <td>{batch.id}</td>
                          <td>{batch.name}</td>
                          <td>{batch.date}</td>
                          <td>{batch.rpCode}</td>
                          <td>{batch.trainingCode}</td>
                          <td>{batch.resourcePersonName}</td>
                          <td>{batch.evaluations.length}</td>
                          <td>
                            <div className="row-actions">
                              <button type="button" onClick={() => openBatchEvaluation(batch.id)}>
                                Add Evaluation
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => openBatchEntries(batch.id)}
                              >
                                View Entries
                              </button>
                              <button
                                type="button"
                                className={String(batch.id) === editBatchId ? '' : 'secondary'}
                                onClick={() => startEditBatch(batch)}
                              >
                                {String(batch.id) === editBatchId ? 'Editing' : 'Edit'}
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => handleDeleteBatch(batch)}
                                disabled={deletingBatchId === String(batch.id)}
                              >
                                {deletingBatchId === String(batch.id) ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">
                  {batchSearch ? 'No batches match your search.' : 'No batches have been created yet.'}
                </p>
              )}
            </section>
          </section>
        ) : null}

        {currentPage === 'evaluation' ? (
          <section className={isPublicEvaluation ? 'public-evaluation-stack' : undefined}>
            {isPublicEvaluation ? (
              <section className="public-evaluation-header">
                <p className="eyebrow">ARRPE TMIS</p>
                <h2>Resource Person Evaluation</h2>
                <p>
                  {activeBatch
                    ? `You are evaluating ${activeBatch.name} (${activeBatch.date}).`
                    : 'Loading evaluation link...'}
                </p>
              </section>
            ) : null}

            <section className="panel">
              <div className="section-heading">
                <h3>Training Details</h3>
                <p>
                  {activeBatch
                    ? `Training details are filled from ${activeBatch.name} (${activeBatch.date}).`
                    : 'Choose a batch from the batch table before creating an evaluation.'}
                </p>
              </div>

              {!isPublicEvaluation ? (
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={handleExportEvaluationForm}
                  disabled={!activeBatch}
                >
                  Export to Word (.docx)
                </button>
              </div>
              ) : null}

              {!isPublicEvaluation && activeBatch ? (
                <section className="share-evaluation-card">
                  <div>
                    <div className="section-heading">
                      <h3>Public Evaluation Link</h3>
                      <p>Share this link or QR code with respondents. It opens only the evaluation form for this batch.</p>
                    </div>

                    <div className="share-link-row">
                      <input value={publicEvaluationUrl} readOnly aria-label="Public evaluation link" />
                      <button type="button" className="secondary" onClick={handleCopyPublicEvaluationLink}>
                        Copy Link
                      </button>
                    </div>
                  </div>

                  <div className="qr-card">
                    <img src={publicEvaluationQrUrl} alt="Public evaluation QR code" />
                  </div>
                </section>
              ) : null}

              <form onSubmit={handleSubmit} className="tmis-form">
                {!activeBatch ? (
                  <div className="form-lock">
                    {isPublicEvaluation
                      ? 'This evaluation link is invalid or the batch is no longer available.'
                      : 'Go to Batches and choose Add Evaluation for the batch you want to use.'}
                  </div>
                ) : null}

                <div className="field-grid">
                  <label>
                    Respondent Name
                    <input
                      name="respondentName"
                      value={formData.respondentName}
                      onChange={handleChange}
                      placeholder="Enter respondent name"
                      disabled={!activeBatch}
                      required
                    />
                  </label>

                  <label>
                    RP Code
                    <input
                      name="rpCode"
                      value={activeBatch?.rpCode || formData.rpCode}
                      onChange={handleChange}
                      placeholder="RP-001"
                      disabled
                      required
                    />
                  </label>

                  <label>
                    Training Code
                    <input
                      name="trainingCode"
                      value={activeBatch?.trainingCode || formData.trainingCode}
                      onChange={handleChange}
                      placeholder="TR-100"
                      disabled
                      required
                    />
                  </label>

                  <label>
                    Resource Person Name
                    <input
                      name="resourcePersonName"
                      value={activeBatch?.resourcePersonName || formData.resourcePersonName}
                      onChange={handleChange}
                      placeholder="Enter resource person"
                      disabled
                      required
                    />
                  </label>

                  <label>
                    Training Title
                    <input
                      name="trainingTitle"
                      value={activeBatch?.name || formData.trainingTitle}
                      onChange={handleChange}
                      placeholder="Enter training title"
                      disabled
                      required
                    />
                  </label>

                  <label>
                    Delivery Date
                    <input
                      type="date"
                      name="deliveryDate"
                      value={activeBatch?.date || formData.deliveryDate}
                      onChange={handleChange}
                      disabled
                      required
                    />
                  </label>

                  <label className="full-width">
                    Topic/s Delivered
                    <textarea
                      name="topicDelivered"
                      rows="3"
                      value={activeBatch?.topicDelivered || formData.topicDelivered}
                      onChange={handleChange}
                      disabled
                      required
                    />
                  </label>
                </div>

                {renderTopicEvaluationTable(formData, handleTopicEvaluationChange, 'create-topic', !activeBatch)}

                <div className="section-heading">
                  <h3>Resource Person Evaluation</h3>
                  <p>Enter numeric scores between 1 and 5 for each criterion.</p>
                </div>

                <div className="score-grid">
                  {scoreFields.map((field) => (
                    <label key={field.key} className="score-item">
                      {field.label}
                      <input
                        type="number"
                        name={field.key}
                        min="1"
                        max="5"
                        step="1"
                        value={formData[field.key]}
                        onChange={handleChange}
                        disabled={!activeBatch}
                        required
                      />
                    </label>
                  ))}
                </div>

                <div className="section-heading">
                  <h3>Feedback</h3>
                  <p>Share what the respondent liked, disliked, and any additional remarks.</p>
                </div>

                <div className="feedback-grid">
                  <label>
                    Liked About RP
                    <textarea
                      name="likedAboutRP"
                      rows="4"
                      value={formData.likedAboutRP}
                      onChange={handleChange}
                      placeholder="What did the resource person do well?"
                      disabled={!activeBatch}
                    />
                  </label>

                  <label>
                    Disliked About RP
                    <textarea
                      name="dislikedAboutRP"
                      rows="4"
                      value={formData.dislikedAboutRP}
                      onChange={handleChange}
                      placeholder="What could be improved?"
                      disabled={!activeBatch}
                    />
                  </label>

                  <label className="full-width">
                    Other Remarks
                    <textarea
                      name="otherRemarks"
                      rows="4"
                      value={formData.otherRemarks}
                      onChange={handleChange}
                      placeholder="Any additional comments or observations"
                      disabled={!activeBatch}
                    />
                  </label>
                </div>

                <div className="actions">
                  <button type="submit" disabled={isSaving || !activeBatch}>
                    {isSaving ? 'Saving...' : 'Submit Evaluation'}
                  </button>
                  <button type="button" className="secondary" onClick={handleReset} disabled={isSaving}>
                    Reset Form
                  </button>
                </div>
              </form>
            </section>
          </section>
        ) : null}

        {currentPage === 'import' ? (
          <section className="page-stack">
            <section className="panel">
              <div className="table-toolbar">
                <div className="section-heading">
                  <h3>Import Excel</h3>
                  <p>
                    Upload an Excel workbook with a Criteria_Assessment tab. The imported rows can be exported to the
                    Word report layout.
                  </p>
                </div>

                <div className="toolbar-actions">
                  <label className="file-import-control">
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleImportExcel}
                      disabled={isImportingExcel}
                    />
                    <span>{isImportingExcel ? 'Reading Excel...' : 'Choose Excel File'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleExportImportedWord}
                    disabled={!importedBatch?.evaluations?.length || isImportingExcel}
                  >
                    Generate Word (.docx)
                  </button>
                </div>
              </div>

              {importedBatch ? (
                <div className="import-summary-grid">
                  <div>
                    <span>Source File</span>
                    <strong>{importedBatch.sourceFileName}</strong>
                  </div>
                  <div>
                    <span>Training</span>
                    <strong>{importedBatch.name || 'Not found'}</strong>
                  </div>
                  <div>
                    <span>Resource Person</span>
                    <strong>{importedBatch.resourcePersonName || 'Not found'}</strong>
                  </div>
                  <div>
                    <span>Delivery Date</span>
                    <strong>{importedBatch.date || 'Not found'}</strong>
                  </div>
                  <div>
                    <span>Imported Rows</span>
                    <strong>{importedBatch.evaluations.length}</strong>
                  </div>
                  <div>
                    <span>RP Code</span>
                    <strong>{importedBatch.rpCode || 'Not found'}</strong>
                  </div>
                </div>
              ) : (
                <p className="empty-state">
                  Choose the sample workbook or another compatible `.xlsx` file to preview imported criteria data.
                </p>
              )}
            </section>

            {importedBatch?.evaluations?.length ? (
              <section className="panel">
                <div className="section-heading">
                  <h3>Imported Criteria Preview</h3>
                  <p>Showing the first 12 parsed rows from Criteria_Assessment.</p>
                </div>

                <div className="entries-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Respondent</th>
                        <th>Training</th>
                        <th>Resource Person</th>
                        <th>Delivery Date</th>
                        <th>Average</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importedBatch.evaluations.slice(0, 12).map((evaluation) => (
                        <tr key={evaluation.id}>
                          <td>{evaluation.respondentName || 'N/A'}</td>
                          <td>{evaluation.trainingTitle}</td>
                          <td>{evaluation.resourcePersonName}</td>
                          <td>{evaluation.deliveryDate}</td>
                          <td>{evaluation.averageScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {currentPage === 'entries' ? (
          <section className="panel">
            <div className="table-toolbar">
              <div className="section-heading">
                <h3>Evaluation Entries</h3>
                <p>
                  {activeBatch
                    ? `${filteredEvaluations.length} of ${activeBatch.evaluations.length} entries under ${activeBatch.name}`
                    : 'Choose a batch from the batch list to view entries.'}
                </p>
              </div>

              <div className="toolbar-actions">
                <label className="search-field compact-search">
                  Respondent
                  <input
                    type="search"
                    value={respondentSearch}
                    onChange={(event) => setRespondentSearch(event.target.value)}
                    placeholder="Filter respondent"
                    disabled={!activeBatch || !activeBatch.evaluations.length}
                  />
                </label>
                <button type="button" className="secondary" onClick={handleExportWord} disabled={!activeBatch}>
                  Export Word (.docx)
                </button>
                <button type="button" onClick={handleExportExcel} disabled={!activeBatch}>
                  Export Spreadsheet
                </button>
                <button type="button" className="secondary" onClick={() => setCurrentPage('batches')}>
                  Choose Batch
                </button>
              </div>
            </div>

            {activeBatch?.evaluations.length && filteredEvaluations.length ? (
              <div className="entries-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Respondent</th>
                      <th>Training</th>
                      <th>Resource Person</th>
                      <th>Delivery Date</th>
                      <th>Average</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvaluations.map((evaluation) => (
                      <tr key={evaluation.id}>
                        <td>{evaluation.respondentName}</td>
                        <td>{evaluation.trainingTitle}</td>
                        <td>{evaluation.resourcePersonName}</td>
                        <td>{evaluation.deliveryDate}</td>
                        <td>{evaluation.averageScore}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => startViewEvaluation(evaluation)}
                            >
                              View
                            </button>
                            <button type="button" onClick={() => startEditEvaluation(evaluation)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDeleteEvaluation(evaluation)}
                              disabled={deletingEvaluationId === String(evaluation.id)}
                            >
                              {deletingEvaluationId === String(evaluation.id) ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">
                {activeBatch
                  ? respondentSearch.trim()
                    ? 'No evaluation entries match that respondent.'
                    : 'No evaluation entries have been created in this batch yet.'
                  : 'Select a batch from the batch table first.'}
              </p>
            )}

            {editEvaluationId ? (
              <form onSubmit={handleUpdateEvaluation} className="edit-panel">
                <div className="section-heading">
                  <h3>Edit Evaluation</h3>
                  <p>
                    Updating entry #{editEvaluationId} under {activeBatch?.name}.
                  </p>
                </div>

                <div className="field-grid">
                  <label>
                    Respondent Name
                    <input
                      name="respondentName"
                      value={editFormData.respondentName}
                      onChange={handleEditChange}
                      required
                    />
                  </label>

                  <label>
                    RP Code
                    <input
                      name="rpCode"
                      value={editFormData.rpCode}
                      onChange={handleEditChange}
                      required
                    />
                  </label>

                  <label>
                    Training Code
                    <input
                      name="trainingCode"
                      value={editFormData.trainingCode}
                      onChange={handleEditChange}
                      required
                    />
                  </label>

                  <label>
                    Resource Person Name
                    <input
                      name="resourcePersonName"
                      value={editFormData.resourcePersonName}
                      onChange={handleEditChange}
                      required
                    />
                  </label>

                  <label>
                    Training Title
                    <input
                      name="trainingTitle"
                      value={editFormData.trainingTitle}
                      onChange={handleEditChange}
                      required
                    />
                  </label>

                  <label>
                    Delivery Date
                    <input
                      type="date"
                      name="deliveryDate"
                      value={editFormData.deliveryDate}
                      onChange={handleEditChange}
                      required
                    />
                  </label>

                  <label className="full-width">
                    Topic/s Delivered
                    <textarea
                      name="topicDelivered"
                      rows="3"
                      value={editFormData.topicDelivered}
                      onChange={handleEditChange}
                      required
                    />
                  </label>
                </div>

                {renderTopicEvaluationTable(editFormData, handleEditTopicEvaluationChange, 'edit-topic')}

                <div className="score-grid">
                  {scoreFields.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <input
                        type="number"
                        name={field.key}
                        min="1"
                        max="5"
                        step="1"
                        value={editFormData[field.key]}
                        onChange={handleEditChange}
                        required
                      />
                    </label>
                  ))}
                </div>

                <div className="feedback-grid">
                  <label>
                    Liked About RP
                    <textarea
                      name="likedAboutRP"
                      rows="3"
                      value={editFormData.likedAboutRP}
                      onChange={handleEditChange}
                    />
                  </label>

                  <label>
                    Disliked About RP
                    <textarea
                      name="dislikedAboutRP"
                      rows="3"
                      value={editFormData.dislikedAboutRP}
                      onChange={handleEditChange}
                    />
                  </label>

                  <label className="full-width">
                    Other Remarks
                    <textarea
                      name="otherRemarks"
                      rows="3"
                      value={editFormData.otherRemarks}
                      onChange={handleEditChange}
                    />
                  </label>
                </div>

                <div className="actions">
                  <button type="submit" disabled={isUpdating}>
                    {isUpdating ? 'Updating...' : 'Save Changes'}
                  </button>
                  <button type="button" className="secondary" onClick={cancelEditEvaluation} disabled={isUpdating}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {viewEvaluation ? (
              <section className="view-panel">
                <div className="table-toolbar">
                  <div className="section-heading">
                    <h3>Evaluation Details</h3>
                    <p>
                      Viewing entry #{viewEvaluation.id} under {activeBatch?.name}.
                    </p>
                  </div>

                  <div className="toolbar-actions">
                    <button type="button" onClick={() => startEditEvaluation(viewEvaluation)}>
                      Edit This Entry
                    </button>
                    <button type="button" className="secondary" onClick={handleExportEvaluationForm} disabled={!activeBatch}>
                      Export to Word (.docx)
                    </button>
                    <button type="button" className="secondary" onClick={closeViewEvaluation}>
                      Close
                    </button>
                  </div>
                </div>

                <div className="detail-grid">
                  <div>
                    <span>Respondent</span>
                    <strong>{viewEvaluation.respondentName}</strong>
                  </div>
                  <div>
                    <span>Training</span>
                    <strong>{viewEvaluation.trainingTitle}</strong>
                  </div>
                  <div>
                    <span>Resource Person</span>
                    <strong>{viewEvaluation.resourcePersonName}</strong>
                  </div>
                  <div>
                    <span>Delivery Date</span>
                    <strong>{viewEvaluation.deliveryDate}</strong>
                  </div>
                  <div>
                    <span>RP Code</span>
                    <strong>{viewEvaluation.rpCode}</strong>
                  </div>
                  <div>
                    <span>Training Code</span>
                    <strong>{viewEvaluation.trainingCode}</strong>
                  </div>
                  <div>
                    <span>Topic/s Delivered</span>
                    <strong>{viewEvaluation.topicDelivered}</strong>
                  </div>
                  <div>
                    <span>Average Score</span>
                    <strong>{viewEvaluation.averageScore}</strong>
                  </div>
                  <div>
                    <span>Submitted</span>
                    <strong>{viewEvaluation.submittedAt || 'Not available'}</strong>
                  </div>
                </div>

                <div className="score-detail-grid">
                  {scoreFields.map((field) => (
                    <div key={field.key}>
                      <span>{field.label}</span>
                      <strong>{viewEvaluation[field.key]}</strong>
                    </div>
                  ))}
                </div>

                {viewEvaluation.topicEvaluations?.length ? (
                  <div className="entries-table-wrap">
                    <table className="topic-evaluation-table">
                      <thead>
                        <tr>
                          <th>Topic</th>
                          <th>Relevance</th>
                          <th>Time Allocation</th>
                          <th>Suggested Time</th>
                          <th>Methodology</th>
                          <th>Suggested Methodology</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewEvaluation.topicEvaluations.map((item) => (
                          <tr key={item.topic}>
                            <td className="topic-name">{item.topic}</td>
                            <td>{formatTopicEvaluationValue(item.relevance)}</td>
                            <td>{formatTopicEvaluationValue(item.timeAllocation)}</td>
                            <td>{item.suggestedTimeAllocation || 'Not applicable'}</td>
                            <td>{formatTopicEvaluationValue(item.methodology)}</td>
                            <td>{item.suggestedMethodology || 'Not applicable'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <div className="remarks-grid">
                  <div>
                    <span>Liked About RP</span>
                    <p>{viewEvaluation.likedAboutRP || 'No remarks'}</p>
                  </div>
                  <div>
                    <span>Disliked About RP</span>
                    <p>{viewEvaluation.dislikedAboutRP || 'No remarks'}</p>
                  </div>
                  <div>
                    <span>Other Remarks</span>
                    <p>{viewEvaluation.otherRemarks || 'No remarks'}</p>
                  </div>
                </div>
              </section>
            ) : null}

            {activeBatch ? (
              <section className="likert-panel">
                <div className="table-toolbar">
                  <div className="section-heading">
                    <h3>Results per Criteria</h3>
                    <p>
                      Percentage of participants per rating for each criterion in {activeBatch.name}.
                    </p>
                  </div>

                  <div className="respondent-count">
                    <span>Respondents</span>
                    <strong>{filteredEvaluations.length}</strong>
                  </div>
                </div>

                <div className="likert-legend">
                  {likertRatings.map((rating) => (
                    <div key={rating.value}>
                      <strong>{rating.value}</strong>
                      <span>{rating.label}</span>
                    </div>
                  ))}
                </div>

                <div className="entries-table-wrap">
                  <table className="likert-table">
                    <thead>
                      <tr>
                        <th rowSpan="2">Criteria</th>
                        <th colSpan="5">Percentage of Participants</th>
                      </tr>
                      <tr>
                        {likertRatings.map((rating) => (
                          <th key={rating.value}>{rating.value}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {likertSummary.map((field) => (
                        <tr key={field.key}>
                          <td>{field.label}</td>
                          {likertRatings.map((rating) => {
                            const count = field.counts[rating.value]
                            const percent = field.total ? (count / field.total) * 100 : 0

                            return (
                              <td key={rating.value}>
                                <div className="rating-count">
                                  <strong>{formatPercentage(percent)}</strong>
                                  <span style={{ width: `${percent}%` }} />
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                      <tr className="average-row">
                        <td>AVERAGE</td>
                        {likertRatings.map((rating) => (
                          <td key={rating.value}>
                            <strong>{formatPercentage(likertAverages[rating.value])}</strong>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {activeBatch ? (
              <section className="likert-panel">
                <div className="section-heading">
                  <h3>Answer Count Reference</h3>
                  <p>
                    Raw number of respondents who selected each rating.
                  </p>
                </div>

                <div className="entries-table-wrap">
                  <table className="likert-table">
                    <thead>
                      <tr>
                        <th>Criteria</th>
                        {likertRatings.map((rating) => (
                          <th key={rating.value}>{rating.value}</th>
                        ))}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {likertSummary.map((field) => (
                        <tr key={field.key}>
                          <td>{field.label}</td>
                          {likertRatings.map((rating) => (
                            <td key={rating.value}>{field.counts[rating.value]}</td>
                          ))}
                          <td>{field.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

          </section>
        ) : null}
      </main>

      {renderPrintForm(viewEvaluation || { ...activeBatch, ...formData })}
    </div>
  )
}

export default App
