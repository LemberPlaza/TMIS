import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import atiLogo from '../images/ati logo.png'
import bagongPilipinasLogo from '../images/Bagongpilipinas.png'

type Evaluation = Record<string, unknown>

type Batch = {
  id?: string | number
  name?: string
  date?: string
  rpCode?: string
  trainingCode?: string
  resourcePersonName?: string
  topicDelivered?: string
  evaluations?: Evaluation[]
}

type Alignment = (typeof AlignmentType)[keyof typeof AlignmentType]

const fontName = 'Cambria'
const fontSize = 22
const formFontSize = 15
const checkMark = '\u2713'
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const blackBorder = { style: BorderStyle.SINGLE, size: 4, color: '000000' }

const criteria = [
  ['Clarity of the topic objectives at the beginning', 'clarityObjectives'],
  ['Organization/sequencing of Topic', 'topicOrganization'],
  ['Clarity of topic/ideas presented/discussed', 'clarityPresentation'],
  ['Quality and effectiveness of instructional aids used', 'instructionalAidsQuality'],
  ['Ability to teach/communicate ideas', 'teachingAbility'],
  ['Ability to answer questions', 'questionAnsweringAbility'],
  ['Ability to arouse/sustain interest', 'participantInterest'],
  ['Ability to manage time', 'timeManagement'],
  ['How the topic was ended', 'topicEnding'],
  ['Overall level of satisfaction', 'overallSatisfaction'],
] as const

const formatDate = (value: unknown) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

const splitTopics = (value: unknown) =>
  String(value ?? '')
    .split(/\r?\n|;/)
    .map((topic) => topic.trim())
    .filter(Boolean)

const percentageText = (value: number) => (value > 0 ? `${value.toFixed(2)}%` : '')

const buildSummary = (evaluations: Evaluation[]) => {
  const totals: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const summary = criteria.map(([label, key]) => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

    evaluations.forEach((evaluation) => {
      const rating = Number(evaluation[key])
      if (counts[rating] !== undefined) counts[rating] += 1
    })

    const percentages: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    ;[1, 2, 3, 4, 5].forEach((rating) => {
      percentages[rating] = evaluations.length ? (counts[rating] / evaluations.length) * 100 : 0
      totals[rating] += percentages[rating]
    })

    return { label, percentages }
  })

  const averages: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  ;[1, 2, 3, 4, 5].forEach((rating) => {
    averages[rating] = summary.length ? totals[rating] / summary.length : 0
  })

  return { summary, averages }
}

const addUnique = (comments: Map<string, string>, comment: unknown) => {
  const cleaned = String(comment ?? '').replace(/\s+/g, ' ').trim()
  if (cleaned) comments.set(cleaned.toLowerCase(), cleaned)
}

const buildComments = (evaluations: Evaluation[]) => {
  const liked = new Map<string, string>()
  const improvements = new Map<string, string>()
  const remarks = new Map<string, string>()

  evaluations.forEach((evaluation) => {
    addUnique(liked, evaluation.likedAboutRP)
    addUnique(improvements, evaluation.dislikedAboutRP)
    addUnique(remarks, evaluation.otherRemarks)
  })

  const groups = [[...liked.values()], [...improvements.values()], [...remarks.values()]]
  const balanced: string[] = []

  while (balanced.length < 5) {
    let added = false
    groups.forEach((group) => {
      const comment = group.shift()
      if (comment && balanced.length < 5) {
        balanced.push(comment)
        added = true
      }
    })
    if (!added) break
  }

  while (balanced.length < 5) {
    balanced.push('No additional respondent comment was provided for this item.')
  }

  return balanced.slice(0, 5)
}

const buildLineRuns = (value: string) => {
  const lines = value.split(/\r?\n/)

  return lines.map((line, index) =>
    new TextRun({
      text: line,
      break: index > 0 ? 1 : undefined,
      font: fontName,
      size: fontSize,
    }),
  )
}

const buildTableCell = (
  text: string,
  width: number,
  options: {
    bold?: boolean
    align?: Alignment
    borderless?: boolean
    spacingAfter?: number
    columnSpan?: number
    rowSpan?: number
  } = {},
) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: options.columnSpan,
    rowSpan: options.rowSpan,
    borders: options.borderless
      ? {
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        }
      : undefined,
    children: [
      new Paragraph({
        alignment: options.align,
        spacing: options.spacingAfter ? { after: options.spacingAfter } : undefined,
        children: [new TextRun({ text, bold: options.bold, font: fontName, size: fontSize })],
      }),
    ],
  })

const valueText = (...values: unknown[]) => {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '')
  return String(value ?? '')
}

const normalizeTopicRows = (source: Evaluation) => {
  const topicEvaluations = source.topicEvaluations
  const rows = Array.isArray(topicEvaluations)
    ? topicEvaluations
    : Object.entries((topicEvaluations || {}) as Record<string, Record<string, unknown>>).map(([topic, item]) => ({
        topic,
        ...item,
      }))

  if (rows.length) return rows as Record<string, unknown>[]

  const topics = splitTopics(source.topicDelivered)
  return Array.from({ length: 3 }).map((_, index) => ({
    topic: topics[index] || (index === 0 ? valueText(source.topicDelivered) : ''),
    relevance: '',
    timeAllocation: '',
    suggestedTimeAllocation: '',
    methodology: '',
    suggestedMethodology: '',
  }))
}

const downloadDocx = async (doc: Document, safeName: string, suffix: string) => {
  const blob = await Packer.toBlob(doc)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${safeName}-${suffix}.docx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}

const safeFileName = (value: unknown, fallback: string) =>
  String(value || fallback)
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback

const formRun = (
  text: string,
  options: {
    bold?: boolean
    italics?: boolean
    size?: number
    color?: string
    break?: number
  } = {},
) =>
  new TextRun({
    text,
    bold: options.bold,
    italics: options.italics,
    break: options.break,
    color: options.color,
    font: 'Arial',
    size: options.size ?? formFontSize,
  })

const formParagraph = (
  children: TextRun[] = [],
  options: { align?: Alignment; after?: number; before?: number } = {},
) =>
  new Paragraph({
    alignment: options.align,
    spacing: { before: options.before ?? 0, after: options.after ?? 0 },
    children,
  })

const formTextParagraph = (
  text: string,
  options: Parameters<typeof formRun>[1] & { align?: Alignment; after?: number; before?: number } = {},
) =>
  formParagraph(
    String(text)
      .split('\n')
      .map((line, index) => formRun(line, { ...options, break: index > 0 ? 1 : undefined })),
    { align: options.align, after: options.after, before: options.before },
  )

const formCell = (
  children: Paragraph[],
  width: number,
  options: {
    columnSpan?: number
    rowSpan?: number
    borderless?: boolean
    verticalAlign?: (typeof VerticalAlign)[keyof typeof VerticalAlign]
    margins?: { top?: number; bottom?: number; left?: number; right?: number }
  } = {},
) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: options.columnSpan,
    rowSpan: options.rowSpan,
    verticalAlign: options.verticalAlign ?? VerticalAlign.CENTER,
    margins: options.margins ?? { top: 18, bottom: 18, left: 35, right: 35 },
    borders: options.borderless
      ? { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }
      : { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
    children,
  })

const formRow = (children: TableCell[], height?: number) =>
  new TableRow({
    children,
    cantSplit: true,
    height: height ? { value: height, rule: HeightRule.EXACT } : undefined,
  })

const formCellText = (
  text: string,
  width: number,
  options: Parameters<typeof formRun>[1] & {
    align?: Alignment
    columnSpan?: number
    rowSpan?: number
    borderless?: boolean
    verticalAlign?: (typeof VerticalAlign)[keyof typeof VerticalAlign]
  } = {},
) =>
  formCell([formTextParagraph(text, { ...options, align: options.align })], width, {
    columnSpan: options.columnSpan,
    rowSpan: options.rowSpan,
    borderless: options.borderless,
    verticalAlign: options.verticalAlign,
  })

const fieldTable = (rows: [string, string][]) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: rows.map(
      ([label, value]) =>
        formRow(
          [
            formCellText(label, 2500, { bold: true, borderless: true }),
            new TableCell({
              width: { size: 6500, type: WidthType.DXA },
              margins: { top: 0, bottom: 0, left: 20, right: 20 },
              borders: { top: noBorder, bottom: blackBorder, left: noBorder, right: noBorder },
              children: [formTextParagraph(value || ' ')],
            }),
          ],
          250,
        ),
    ),
  })

const marked = (value: unknown, expected: string) => (value === expected ? checkMark : '')

const loadCroppedImage = async (src: string, errorMessage: string) => {
  const response = await fetch(src)
  if (!response.ok) throw new Error(errorMessage)
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return blob.arrayBuffer()

    context.drawImage(image, 0, 0)
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4
        const red = data[index]
        const green = data[index + 1]
        const blue = data[index + 2]
        const alpha = data[index + 3]
        const isVisible = alpha > 12 && !(red > 248 && green > 248 && blue > 248)

        if (isVisible) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }

    if (minX > maxX || minY > maxY) return blob.arrayBuffer()

    const padding = 18
    const cropX = Math.max(0, minX - padding)
    const cropY = Math.max(0, minY - padding)
    const cropWidth = Math.min(width - cropX, maxX - minX + padding * 2)
    const cropHeight = Math.min(height - cropY, maxY - minY + padding * 2)
    const croppedCanvas = document.createElement('canvas')
    croppedCanvas.width = cropWidth
    croppedCanvas.height = cropHeight
    croppedCanvas.getContext('2d')?.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

    const croppedBlob = await new Promise<Blob>((resolve, reject) => {
      croppedCanvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error(errorMessage))
      }, 'image/png')
    })

    return croppedBlob.arrayBuffer()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const loadOfficialHeaderLogos = async () =>
  Promise.all([
    loadCroppedImage(bagongPilipinasLogo, 'Unable to load the Bagong Pilipinas logo for the Word header.'),
    loadCroppedImage(atiLogo, 'Unable to load the ATI logo for the Word header.'),
  ])

const headerFontName = 'Cambria Math'

const headerRun = (
  text: string,
  options: {
    bold?: boolean
    size?: number
    color?: string
    break?: number
    highlight?: string
    underline?: boolean
  } = {},
) =>
  new TextRun({
    text,
    bold: options.bold,
    break: options.break,
    color: options.color ?? '000000',
    font: headerFontName,
    size: options.size ?? 20,
    highlight: options.highlight,
    underline: options.underline ? {} : undefined,
  })

const buildOfficialHeader = (bagongLogoData: ArrayBuffer, atiLogoData: ArrayBuffer) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      formRow(
        [
          formCell(
            [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                layout: TableLayoutType.FIXED,
                borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
                rows: [
                  formRow([
                    formCell(
                      [
                        new Paragraph({
                          alignment: AlignmentType.RIGHT,
                          spacing: { before: 0, after: 0 },
                          children: [
                            new ImageRun({
                              type: 'png',
                              data: bagongLogoData,
                              transformation: { width: 126, height: 115 },
                            }),
                          ],
                        }),
                      ],
                      1600,
                      { borderless: true, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 0 } },
                    ),
                    formCell(
                      [
                        new Paragraph({
                          alignment: AlignmentType.LEFT,
                          spacing: { before: 0, after: 0 },
                          children: [
                            new ImageRun({
                              type: 'png',
                              data: atiLogoData,
                              transformation: { width: 198, height: 123 },
                            }),
                          ],
                        }),
                      ],
                      2500,
                      { borderless: true, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 0 } },
                    ),
                  ]),
                ],
              }),
            ],
            4250,
            { borderless: true, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 20 } },
          ),
          formCell(
            [
              formParagraph([
                headerRun('Republic of the Philippines', { size: 20 }),
                headerRun('Department of Agriculture', { bold: true, size: 25, break: 1 }),
                headerRun('AGRICULTURAL TRAINING INSTITUTE', {
                  bold: true,
                  color: '00843D',
                  size: 23,
                  break: 1,
                  highlight: 'lightGray',
                }),
                headerRun('Regional Training Center-13', { bold: true, size: 25, break: 1 }),
                headerRun('Los Angeles, Butuan City', { size: 19, break: 1 }),
                headerRun('Mobile Nos.: (+63)945-3296484', { size: 18, break: 1 }),
                headerRun('e-Mail: ', { size: 18, break: 1 }),
                headerRun('aticaraga@ati.da.gov.ph', { color: '2F75B5', size: 18, underline: true }),
                headerRun('URL: https://ati2.da.gov.ph/ati-13; www.e-extension.gov.ph', { size: 16, break: 1 }),
              ], { after: 0 }),
            ],
            6250,
            { borderless: true, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 40, right: 0 } },
          ),
        ],
        1500,
      ),
    ],
  })

export const exportEvaluationFormDocx = async (source: Evaluation = {}, batch: Batch = {}) => {
  const [bagongLogoData, atiLogoData] = await loadOfficialHeaderLogos()
  const data = { ...batch, ...source }
  const respondentName = valueText(data.respondentName)
  const resourcePersonName = valueText(data.resourcePersonName, batch.resourcePersonName)
  const trainingTitle = valueText(data.trainingTitle, batch.name)
  const deliveryDate = valueText(data.deliveryDate, batch.date)
  const topics = normalizeTopicRows(data).slice(0, 3)
  while (topics.length < 3) topics.push({ topic: '', relevance: '', timeAllocation: '', methodology: '' })

  const scoreRows = [
    ['a.', 'Clarity of the topic objectives at the beginning', 'clarityObjectives'],
    ['b.', 'Organization/sequencing of topic', 'topicOrganization'],
    ['c.', 'Clarity of topic/ideas presented/discussed', 'clarityPresentation'],
    ['d.', 'Quality and effectiveness of instructional aids used', 'instructionalAidsQuality'],
    ['e.', 'Ability to teach/communicate ideas', 'teachingAbility'],
    ['f.', 'Ability to answer questions', 'questionAnsweringAbility'],
    ['g.', 'Ability to arouse/sustain interest', 'participantInterest'],
    ['h.', 'Ability to manage time', 'timeManagement'],
    ['i.', 'How the topic was ended', 'topicEnding'],
    ['j.', 'Overall level of satisfaction', 'overallSatisfaction'],
  ] as const

  const headerTable = buildOfficialHeader(bagongLogoData, atiLogoData)

  const topicTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      formRow(
        [
          formCellText('Topic/s\nDiscussed\n(include duration/topic)', 1500, { bold: true, align: AlignmentType.CENTER, rowSpan: 2, size: 12 }),
          formCellText('Relevance', 2250, { bold: true, align: AlignmentType.CENTER, columnSpan: 3 }),
          formCellText('Time Allocation', 2550, { bold: true, align: AlignmentType.CENTER, columnSpan: 3 }),
          formCellText('Methodology Used', 2700, { bold: true, align: AlignmentType.CENTER, columnSpan: 3 }),
        ],
        330,
      ),
      formRow(
        [
          ...['Very\nrelevant', 'Somewhat\nrelevant', 'Not at all\nrelevant', 'Just right', 'Need\nimprovement', 'Suggested\ntime\nallocation', 'Effective', 'Not\nEffective', 'Suggested\nmethodology'].map((label) =>
            formCellText(label, label.includes('Suggested') ? 1050 : 650, { italics: true, align: AlignmentType.CENTER, size: 10 }),
          ),
        ],
        520,
      ),
      ...topics.map(
        (row, index) =>
          formRow(
            [
              formCellText(valueText(row.topic) || `Topic ${index + 1}`, 1500, { align: AlignmentType.CENTER }),
              formCellText(marked(row.relevance, 'veryRelevant'), 650, { align: AlignmentType.CENTER }),
              formCellText(marked(row.relevance, 'somewhatRelevant'), 650, { align: AlignmentType.CENTER }),
              formCellText(marked(row.relevance, 'notRelevant'), 650, { align: AlignmentType.CENTER }),
              formCellText(marked(row.timeAllocation, 'justRight'), 650, { align: AlignmentType.CENTER }),
              formCellText(marked(row.timeAllocation, 'needImprovement'), 650, { align: AlignmentType.CENTER }),
              formCellText(valueText(row.suggestedTimeAllocation), 1050, { align: AlignmentType.CENTER }),
              formCellText(marked(row.methodology, 'effective'), 650, { align: AlignmentType.CENTER }),
              formCellText(marked(row.methodology, 'notEffective'), 650, { align: AlignmentType.CENTER }),
              formCellText(valueText(row.suggestedMethodology), 1050, { align: AlignmentType.CENTER }),
            ],
            420,
          ),
      ),
      formRow([formCellText('', 9000, { columnSpan: 10 })], 360),
    ],
  })

  const likertTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      formRow(
        [
          formCellText('Criteria', 6000, { bold: true, align: AlignmentType.CENTER, rowSpan: 2 }),
          formCellText('Rating', 2500, { bold: true, align: AlignmentType.CENTER, columnSpan: 5 }),
        ],
        300,
      ),
      formRow(
        [1, 2, 3, 4, 5].map((rating) => formCellText(String(rating), 500, { bold: true, align: AlignmentType.CENTER })),
        300,
      ),
      ...scoreRows.map(
        ([letter, label, key]) =>
          formRow(
            [
              formCell([formParagraph([formRun(letter, { bold: true }), formRun(`  ${label}`)])], 6000),
              ...[1, 2, 3, 4, 5].map((rating) =>
                formCellText(String(data[key]) === String(rating) ? checkMark : '', 500, { align: AlignmentType.CENTER }),
              ),
            ],
            370,
          ),
      ),
    ],
  })

  const remarkRows = [
    ['3. What did you like about the resource person?', valueText(data.likedAboutRP)],
    ['4. What did you not like about the resource person?', valueText(data.dislikedAboutRP)],
    ['5. Other remarks', valueText(data.otherRemarks)],
  ]

  const remarksTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: remarkRows.map(
      ([label, value]) =>
        formRow(
          [
            formCell([formTextParagraph(label), formTextParagraph(value || ' ', { after: 260 })], 9000, {
              verticalAlign: VerticalAlign.TOP,
              margins: { top: 45, bottom: 45, left: 55, right: 55 },
            }),
          ],
          1050,
        ),
    ),
  })

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 520, bottom: 520, left: 820, right: 820 },
          },
        },
        children: [
          headerTable,
          formTextParagraph('RESOURCE PERSON EVALUATION FORM', { bold: true, size: 16, align: AlignmentType.CENTER, after: 70 }),
          fieldTable([
            ['Name of Participant (optional):', respondentName],
            ['Resource Person:', resourcePersonName],
            ['Title of Training/Activity:', trainingTitle],
            ['Date of Delivery:', deliveryDate],
          ]),
          formTextParagraph('Instruction: Please provide an honest assessment on the following:', { bold: true, after: 55 }),
          formTextParagraph(
            '1. Relevance, time allocation, and effectiveness of the methodology used by the resource person to discuss the lesson/topic. (Put a check mark and provide suggestions)',
            { after: 30 },
          ),
          topicTable,
          formTextParagraph('2. Level of satisfaction on the following aspects using Likert Scale (Put a check mark)', { after: 45, before: 90 }),
          formParagraph(
            [
              formRun('Rating Guide:   ', { italics: true }),
              formRun('1 - Poor        2 - Fair        3 - Satisfactory        4 - Very Satisfactory        5 - Excellent', {
                bold: true,
                italics: true,
              }),
            ],
            { after: 30 },
          ),
          likertTable,
          new Paragraph({ spacing: { after: 160 }, children: [] }),
          remarksTable,
          new Paragraph({ spacing: { after: 220 }, children: [] }),
          formParagraph([
            formRun('ATI-QF/CDMD-03', { italics: true, color: '44546A', size: 10 }),
            formRun('     Rev. 04', { italics: true, color: '44546A', size: 10 }),
            formRun('     Effectivity Date:  November 26, 2024', { italics: true, color: '44546A', size: 10 }),
          ]),
        ],
      },
    ],
  })

  await downloadDocx(doc, safeFileName(trainingTitle || batch.name, 'evaluation-form'), 'evaluation-form')
}

export const exportEvaluationReportDocx = async (batch: Batch) => {
  const evaluations = batch.evaluations ?? []

  if (!evaluations.length) {
    throw new Error('No evaluation entries are available for this batch.')
  }

  const firstEvaluation = evaluations[0] ?? {}
  const activityTitle = String(firstEvaluation.trainingTitle || batch.name || '')
  const dateAndTime = formatDate(firstEvaluation.deliveryDate || batch.date || '')
  const resourcePerson = String(firstEvaluation.resourcePersonName || batch.resourcePersonName || '')
  const topics = splitTopics(firstEvaluation.topicDelivered || batch.topicDelivered || '')
  const topicText = (topics.length ? topics : ['']).map((topic, index) => `Module ${index + 1}: ${topic}`).join('\n')
  const comments = buildComments(evaluations)
  const { summary, averages } = buildSummary(evaluations)
  const [bagongLogoData, atiLogoData] = await loadOfficialHeaderLogos()

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          buildTableCell('Activity Title', 2800, { borderless: true, spacingAfter: 160 }),
          buildTableCell(activityTitle, 7200, { borderless: true, spacingAfter: 160 }),
        ],
      }),
      new TableRow({
        children: [
          buildTableCell('Date and Time', 2800, { borderless: true, spacingAfter: 160 }),
          buildTableCell(dateAndTime, 7200, { borderless: true, spacingAfter: 160 }),
        ],
      }),
      new TableRow({
        children: [
          buildTableCell('Resource Person', 2800, { borderless: true, spacingAfter: 160 }),
          buildTableCell(resourcePerson, 7200, { borderless: true, spacingAfter: 160 }),
        ],
      }),
      new TableRow({
        children: [
          buildTableCell('Topic/s Delivered', 2800, { borderless: true }),
          new TableCell({
            width: { size: 7200, type: WidthType.DXA },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            },
            children: [
              new Paragraph({
                children: buildLineRuns(topicText),
              }),
            ],
          }),
        ],
      }),
    ],
  })

  const likertTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          buildTableCell('Numerical Rating', 4000, { bold: true, align: AlignmentType.CENTER }),
          buildTableCell('Adjectival Rating', 6000, { bold: true, align: AlignmentType.CENTER }),
        ],
      }),
      ...[
        ['1', 'Poor'],
        ['2', 'Fair'],
        ['3', 'Satisfactorily'],
        ['4', 'Very Satisfactorily'],
        ['5', 'Excellent'],
      ].map(([rating, label]) =>
        new TableRow({
          children: [
            buildTableCell(rating, 4000, { align: AlignmentType.CENTER }),
            buildTableCell(label, 6000, { align: AlignmentType.CENTER }),
          ],
        }),
      ),
    ],
  })

  const resultHeader = [
    new TableRow({
      children: [
        buildTableCell('Criteria', 5200, { bold: true, align: AlignmentType.CENTER, rowSpan: 2 }),
        buildTableCell('Percentage of Participants', 4800, {
          bold: true,
          align: AlignmentType.CENTER,
          columnSpan: 5,
        }),
      ],
    }),
    new TableRow({
      children: [
        ...[1, 2, 3, 4, 5].map((rating) =>
          buildTableCell(String(rating), 960, { bold: true, align: AlignmentType.CENTER }),
        ),
      ],
    }),
  ]

  const resultRows = summary.map((item, index) =>
    new TableRow({
      children: [
        buildTableCell(`${index + 1}. ${item.label}`, 5200),
        ...[1, 2, 3, 4, 5].map((rating) =>
          buildTableCell(percentageText(item.percentages[rating]), 960, { align: AlignmentType.CENTER }),
        ),
      ],
    }),
  )

  const resultAverage = new TableRow({
    children: [
      buildTableCell('AVERAGE', 5200, { bold: true, align: AlignmentType.CENTER }),
      ...[1, 2, 3, 4, 5].map((rating) =>
        buildTableCell(percentageText(averages[rating]), 960, { align: AlignmentType.CENTER }),
      ),
    ],
  })

  const resultsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [...resultHeader, ...resultRows, resultAverage],
  })

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
            },
            margin: {
              top: 720,
              bottom: 994,
              left: 1440,
              right: 1440,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'ISO 9001:2015 Certified',
                    font: 'Arial',
                    size: 16,
                  }),
                  new TextRun({
                    text: 'C.R. NO.: TUV 100 05 3040',
                    break: 1,
                    font: 'Arial',
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          buildOfficialHeader(bagongLogoData, atiLogoData),
          new Paragraph({
            children: [new TextRun({ text: '', font: fontName, size: 8 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: 'Results of the Resource Person Evaluation',
                font: fontName,
                size: fontSize,
                allCaps: true,
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            children: [new TextRun({ text: '', font: fontName, size: fontSize })],
          }),
          infoTable,
          new Paragraph({
            children: [new TextRun({ text: '', font: fontName, size: fontSize })],
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({ text: 'The rating guide for the criteria is in Likert Scale format, as the following:', font: fontName, size: fontSize }),
            ],
          }),
          likertTable,
          new Paragraph({
            children: [new TextRun({ text: '', font: fontName, size: fontSize })],
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({ text: 'Results per Criteria', font: fontName, size: fontSize }),
            ],
          }),
          resultsTable,
          new Paragraph({
            children: [new TextRun({ text: '', font: fontName, size: fontSize })],
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({ text: 'Comments and Suggestions:', font: fontName, size: fontSize }),
            ],
          }),
          ...comments.map(
            (comment, index) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${index + 1}. `,
                    font: fontName,
                    size: fontSize,
                  }),
                  new TextRun({ text: comment, font: fontName, size: fontSize }),
                ],
              }),
          ),
          new Paragraph({
            children: [new TextRun({ text: '', font: fontName, size: fontSize })],
          }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: 'Thank you!',
                  bold: true,
                  font: fontName,
                  size: fontSize,
                }),
              ],
            }),
        ],
      },
    ],
  })

  await downloadDocx(doc, safeFileName(batch.name, 'batch'), 'evaluation-report')
}
