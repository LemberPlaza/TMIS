import JSZip from 'jszip'

type CellMap = Record<string, string | number>

const criteriaKeys = [
  'clarityObjectives',
  'topicOrganization',
  'clarityPresentation',
  'instructionalAidsQuality',
  'teachingAbility',
  'questionAnsweringAbility',
  'participantInterest',
  'timeManagement',
  'topicEnding',
  'overallSatisfaction',
] as const

const parseXml = (text: string) => new DOMParser().parseFromString(text, 'application/xml')

const textContent = (element: Element | null) => element?.textContent ?? ''

const columnName = (cellRef: string) => cellRef.replace(/\d+/g, '')

const rowNumber = (cellRef: string) => Number(cellRef.replace(/[A-Z]+/gi, ''))

const excelDateToIso = (value: string | number) => {
  const serial = Number(value)
  if (!Number.isFinite(serial) || serial <= 0) return String(value || '')

  const utcDays = Math.floor(serial - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  return date.toISOString().slice(0, 10)
}

const normalizeRating = (value: unknown) => {
  const rating = Number(value)
  return rating >= 1 && rating <= 5 ? String(Math.round(rating)) : ''
}

const getRelationshipTarget = (relsDoc: Document, relationshipId: string) => {
  const relationship = [...relsDoc.getElementsByTagName('Relationship')].find(
    (item) => item.getAttribute('Id') === relationshipId,
  )
  return relationship?.getAttribute('Target') || ''
}

const normalizeSheetPath = (target: string) => (target.startsWith('xl/') ? target : `xl/${target}`)

const readSharedStrings = (sharedStringsXml: string) => {
  const doc = parseXml(sharedStringsXml)

  return [...doc.getElementsByTagName('si')].map((item) =>
    [...item.getElementsByTagName('t')].map((text) => text.textContent || '').join(''),
  )
}

const readCellValue = (cell: Element, sharedStrings: string[]) => {
  const type = cell.getAttribute('t')
  const value = textContent(cell.getElementsByTagName('v')[0])

  if (type === 's') return sharedStrings[Number(value)] || ''
  if (type === 'inlineStr') return textContent(cell.getElementsByTagName('t')[0])
  return value
}

const readWorksheetRows = (sheetXml: string, sharedStrings: string[]) => {
  const doc = parseXml(sheetXml)
  const rows = new Map<number, CellMap>()

  ;[...doc.getElementsByTagName('c')].forEach((cell) => {
    const ref = cell.getAttribute('r')
    if (!ref) return

    const row = rowNumber(ref)
    const column = columnName(ref)
    const rowCells = rows.get(row) || {}
    rowCells[column] = readCellValue(cell, sharedStrings)
    rows.set(row, rowCells)
  })

  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, cells]) => ({ row, cells }))
}

export const importCriteriaAssessmentWorkbook = async (file: File) => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string')
  const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string')

  if (!workbookXml || !workbookRelsXml) {
    throw new Error('This file does not look like a valid Excel workbook.')
  }

  const workbookDoc = parseXml(workbookXml)
  const workbookRelsDoc = parseXml(workbookRelsXml)
  const criteriaSheet = [...workbookDoc.getElementsByTagName('sheet')].find(
    (sheet) => sheet.getAttribute('name') === 'Criteria_Assessment',
  )

  if (!criteriaSheet) {
    throw new Error('Criteria_Assessment tab was not found in the workbook.')
  }

  const relationshipId = criteriaSheet.getAttribute('r:id') || criteriaSheet.getAttribute('id') || ''
  const sheetTarget = getRelationshipTarget(workbookRelsDoc, relationshipId)
  const sheetPath = normalizeSheetPath(sheetTarget)
  const sheetXml = await zip.file(sheetPath)?.async('string')

  if (!sheetXml) {
    throw new Error('Unable to read the Criteria_Assessment sheet data.')
  }

  const sharedStrings = sharedStringsXml ? readSharedStrings(sharedStringsXml) : []
  const rows = readWorksheetRows(sheetXml, sharedStrings)
  const evaluations = rows
    .filter(({ row }) => row >= 3)
    .map(({ row, cells }) => {
      const evaluation: Record<string, unknown> = {
        id: `import-${row}`,
        respondentName: String(cells.B || '').trim(),
        rpCode: String(cells.C || '').trim(),
        resourcePersonName: String(cells.D || '').trim(),
        trainingTitle: String(cells.E || '').trim(),
        deliveryDate: excelDateToIso(cells.F || ''),
        likedAboutRP: String(cells.Q || '').trim(),
        dislikedAboutRP: String(cells.R || '').trim(),
        otherRemarks: String(cells.S || '').trim(),
      }

      criteriaKeys.forEach((key, index) => {
        evaluation[key] = normalizeRating(cells[String.fromCharCode('G'.charCodeAt(0) + index)])
      })

      const ratings = criteriaKeys.map((key) => Number(evaluation[key])).filter(Number.isFinite)
      const averageScore = ratings.length
        ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
        : 0
      evaluation.averageScore = averageScore ? averageScore.toFixed(2) : ''

      return evaluation
    })
    .filter((evaluation) => evaluation.resourcePersonName || evaluation.trainingTitle || evaluation.respondentName)

  if (!evaluations.length) {
    throw new Error('No usable evaluation rows were found in Criteria_Assessment.')
  }

  const first = evaluations[0]

  return {
    id: `import-${Date.now()}`,
    name: String(first.trainingTitle || file.name.replace(/\.[^.]+$/, '')),
    date: String(first.deliveryDate || ''),
    rpCode: String(first.rpCode || ''),
    trainingCode: '',
    resourcePersonName: String(first.resourcePersonName || ''),
    topicDelivered: '',
    evaluations,
    sourceFileName: file.name,
  }
}
