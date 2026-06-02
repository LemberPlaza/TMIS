import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

type Evaluation = Record<string, unknown>

type Batch = {
  id?: string | number
  name?: string
  date?: string
  resourcePersonName?: string
  topicDelivered?: string
  evaluations?: Evaluation[]
}

type Alignment = (typeof AlignmentType)[keyof typeof AlignmentType]

const fontName = 'Cambria'
const fontSize = 22

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
              top: 1440,
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

  const blob = await Packer.toBlob(doc)
  const safeName = String(batch.name || 'batch').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'batch'
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${safeName}-evaluation-report.docx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}
