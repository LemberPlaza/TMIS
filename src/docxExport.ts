import atiLogoUrl from '../images/ati logo.png'
import bagongPilipinasUrl from '../images/Bagongpilipinas.png'

type Evaluation = Record<string, unknown>

type Batch = {
  id?: string | number
  name?: string
  date?: string
  resourcePersonName?: string
  topicDelivered?: string
  evaluations?: Evaluation[]
}

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

const encoder = new TextEncoder()
let crcTable: number[] | null = null

const escapeXml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

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

const paragraph = (runs = '', options: { align?: string; before?: number; after?: number } = {}) => {
  const spacing =
    options.before !== undefined || options.after !== undefined
      ? `<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 0}"/>`
      : ''
  const align = options.align ? `<w:jc w:val="${options.align}"/>` : ''
  const props = spacing || align ? `<w:pPr>${spacing}${align}</w:pPr>` : ''

  return `<w:p>${props}${runs}</w:p>`
}

const run = (
  text: unknown,
  options: { bold?: boolean; color?: string; size?: number } = {},
) => {
  const props = [
    options.bold ? '<w:b/>' : '',
    options.color ? `<w:color w:val="${escapeXml(options.color)}"/>` : '',
    options.size ? `<w:sz w:val="${options.size}"/>` : '',
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>',
  ].join('')

  const parts = String(text ?? '').split(/\r?\n/)
  const textXml = parts
    .map((part, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(part)}</w:t>`)
    .join('')

  return `<w:r><w:rPr>${props}</w:rPr>${textXml}</w:r>`
}

const textParagraph = (
  text: unknown,
  runOptions: Parameters<typeof run>[1] = {},
  paragraphOptions: Parameters<typeof paragraph>[1] = {},
) => paragraph(run(text, runOptions), paragraphOptions)

const imageRun = (relationshipId: string, width: number, height: number) => `
<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${width}" cy="${height}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>
<wp:docPr id="${relationshipId.replace(/\D/g, '')}" name="Logo"/>
<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="0" name="Logo"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`

const cell = (
  content: string,
  width: number,
  options: { gridSpan?: number; vMerge?: 'restart' | 'continue'; valign?: string } = {},
) => {
  const span = options.gridSpan ? `<w:gridSpan w:val="${options.gridSpan}"/>` : ''
  const merge = options.vMerge ? `<w:vMerge${options.vMerge === 'restart' ? ' w:val="restart"' : ''}/>` : ''
  const valign = options.valign ? `<w:vAlign w:val="${options.valign}"/>` : ''

  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span}${merge}${valign}</w:tcPr>${content}</w:tc>`
}

const table = (
  rows: string[][],
  widths: number[],
  options: { borderless?: boolean; borderSize?: number } = {},
) => {
  const borderSize = options.borderSize ?? 4
  const borders = options.borderless
    ? ''
    : `<w:tblBorders><w:top w:val="single" w:sz="${borderSize}" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="${borderSize}" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="${borderSize}" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="${borderSize}" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="${borderSize}" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="${borderSize}" w:space="0" w:color="000000"/></w:tblBorders>`
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')

  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((sum, width) => sum + width, 0)}" w:type="dxa"/><w:tblCellMar><w:top w:w="12" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="12" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar>${borders}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows
    .map((row) => `<w:tr>${row.join('')}</w:tr>`)
    .join('')}</w:tbl>`
}

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

const getCrcTable = () => {
  if (crcTable) return crcTable

  crcTable = Array.from({ length: 256 }, (_, index) => {
    let c = index
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })

  return crcTable
}

const crc32 = (data: Uint8Array) => {
  const table = getCrcTable()
  let crc = 0xffffffff
  data.forEach((byte) => {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  })
  return (crc ^ 0xffffffff) >>> 0
}

const writeUint16 = (bytes: number[], value: number) => {
  bytes.push(value & 0xff, (value >>> 8) & 0xff)
}

const writeUint32 = (bytes: number[], value: number) => {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

const appendBytes = (target: number[], source: Uint8Array | number[]) => {
  for (let index = 0; index < source.length; index += 1) {
    target.push(source[index])
  }
}

const createZip = (files: Array<{ name: string; data: Uint8Array }>) => {
  const output: number[] = []
  const central: number[] = []

  files.forEach((file) => {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const offset = output.length

    writeUint32(output, 0x04034b50)
    writeUint16(output, 20)
    writeUint16(output, 0)
    writeUint16(output, 0)
    writeUint16(output, 0)
    writeUint16(output, 0)
    writeUint32(output, crc)
    writeUint32(output, file.data.length)
    writeUint32(output, file.data.length)
    writeUint16(output, name.length)
    writeUint16(output, 0)
    appendBytes(output, name)
    appendBytes(output, file.data)

    writeUint32(central, 0x02014b50)
    writeUint16(central, 20)
    writeUint16(central, 20)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint32(central, crc)
    writeUint32(central, file.data.length)
    writeUint32(central, file.data.length)
    writeUint16(central, name.length)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint32(central, 0)
    writeUint32(central, offset)
    appendBytes(central, name)
  })

  const centralOffset = output.length
  appendBytes(output, central)
  writeUint32(output, 0x06054b50)
  writeUint16(output, 0)
  writeUint16(output, 0)
  writeUint16(output, files.length)
  writeUint16(output, files.length)
  writeUint32(output, central.length)
  writeUint32(output, centralOffset)
  writeUint16(output, 0)

  return new Blob([new Uint8Array(output)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

const fetchBytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer())

export const exportEvaluationReportDocx = async (batch: Batch) => {
  const evaluations = batch.evaluations ?? []
  const firstEvaluation = evaluations[0] ?? {}
  const activityTitle = String(firstEvaluation.trainingTitle || batch.name || '')
  const dateAndTime = formatDate(firstEvaluation.deliveryDate || batch.date || '')
  const resourcePerson = String(firstEvaluation.resourcePersonName || batch.resourcePersonName || '')
  const topics = splitTopics(firstEvaluation.topicDelivered || batch.topicDelivered || '')
  const topicText = (topics.length ? topics : ['']).map((topic, index) => `Module ${index + 1}: ${topic}`).join('\n')
  const comments = buildComments(evaluations)
  const { summary, averages } = buildSummary(evaluations)
  const [bagongLogo, atiLogo] = await Promise.all([fetchBytes(bagongPilipinasUrl), fetchBytes(atiLogoUrl)])

  let body = ''
  body += table(
    [
      [
        cell(paragraph([imageRun('rId1', 640000, 640000), imageRun('rId2', 760000, 760000)].join(''), { align: 'right' }), 3600),
        cell(
          paragraph(
            [
              run('Republic of the Philippines\nDepartment of Agriculture\n', { size: 14 }),
              run('AGRICULTURAL TRAINING INSTITUTE\n', { bold: true, color: '18A45B', size: 24 }),
              run('Regional Training Center-13\n', { bold: true, size: 19 }),
              run('Los Angeles, Butuan City\nMobile Nos.: (+63)945-3926484\ne-Mail: ati.caraga@ati.da.gov.ph\nURL: https://ati2.da.gov.ph/ati-13; www.e-extension.gov.ph', { size: 14 }),
            ].join(''),
          ),
          5200,
        ),
      ],
    ],
    [3600, 5200],
    { borderless: true },
  )
  body += textParagraph('RESULTS OF THE RESOURCE PERSON EVALUATION', { bold: true, size: 20 }, { align: 'center', before: 85, after: 300 })
  body += table(
    [
      [cell(textParagraph('Activity Title:', { size: 18 }), 2250), cell(textParagraph(activityTitle, { size: 18 }), 6550)],
      [cell(textParagraph('Date and Time:', { size: 18 }), 2250), cell(textParagraph(dateAndTime, { size: 18 }), 6550)],
      [cell(textParagraph('Name of Resource Person:', { size: 18 }), 2250), cell(textParagraph(resourcePerson, { size: 18 }), 6550)],
      [cell(textParagraph('Topic/s Delivered:', { size: 18 }), 2250, { valign: 'top' }), cell(textParagraph(topicText, { size: 18 }), 6550)],
    ],
    [2250, 6550],
    { borderless: true },
  )
  body += textParagraph('The rating guide for the criteria is in Likert Scale format as the following:', { size: 18 }, { before: 100, after: 35 })
  body += table(
    [
      [cell(textParagraph('Numerical Rating', { bold: true, size: 17 }, { align: 'center' }), 3000), cell(textParagraph('Adjectival Rating', { bold: true, size: 17 }, { align: 'center' }), 3000)],
      ...[
        ['1', 'Poor'],
        ['2', 'Fair'],
        ['3', 'Satisfactorily'],
        ['4', 'Very Satisfactorily'],
        ['5', 'Excellent'],
      ].map(([rating, label]) => [
        cell(textParagraph(rating, { size: 17 }, { align: 'center' }), 3000),
        cell(textParagraph(label, { size: 17 }, { align: 'center' }), 3000),
      ]),
    ],
    [3000, 3000],
  )
  body += textParagraph('Results per criteria', { size: 17 }, { before: 45, after: 10 })

  const resultRows: string[][] = [
    [
      cell(textParagraph('Criteria', { bold: true, size: 16 }, { align: 'center' }), 4700, { vMerge: 'restart' }),
      cell(textParagraph('Percentage of Participants', { bold: true, size: 16 }, { align: 'center' }), 4100, { gridSpan: 5 }),
    ],
    [
      cell(paragraph(), 4700, { vMerge: 'continue' }),
      ...[1, 2, 3, 4, 5].map((rating) => cell(textParagraph(String(rating), { size: 16 }, { align: 'center' }), 820)),
    ],
    ...summary.map((item, index) => [
      cell(textParagraph(`${index + 1}. ${item.label}`, { size: 15 }), 4700),
      ...[1, 2, 3, 4, 5].map((rating) =>
        cell(textParagraph(percentageText(item.percentages[rating]), { size: 15 }, { align: 'center' }), 820),
      ),
    ]),
    [
      cell(textParagraph('AVERAGE', { bold: true, size: 15 }, { align: 'center' }), 4700),
      ...[1, 2, 3, 4, 5].map((rating) =>
        cell(textParagraph(percentageText(averages[rating]), { bold: true, size: 15 }, { align: 'center' }), 820),
      ),
    ],
  ]

  body += table(resultRows, [4700, 820, 820, 820, 820, 820])
  body += textParagraph('Comments and Suggestions:', { bold: true, size: 17 }, { before: 16, after: 0 })
  comments.forEach((comment, index) => {
    body += paragraph(`${run(`${index + 1}. `, { size: 16 })}${run(comment, { size: 16 })}`, { after: 0 })
  })
  body += textParagraph('Thank you!', { bold: true, size: 17 }, { align: 'center', before: 65, after: 250 })
  body += textParagraph('ISO 9001:2015 Certified\nC.R. No.: TUV 100 05 3040', { color: '808080', size: 12 }, { align: 'center' })

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
<w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="504" w:right="792" w:bottom="576" w:left="792" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`

  const files = [
    {
      name: '[Content_Types].xml',
      data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    },
    {
      name: '_rels/.rels',
      data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/Bagongpilipinas.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/ati-logo.png"/></Relationships>'),
    },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
    { name: 'word/media/Bagongpilipinas.png', data: bagongLogo },
    { name: 'word/media/ati-logo.png', data: atiLogo },
  ]

  const blob = createZip(files)
  const safeName = String(batch.name || 'batch').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'batch'
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${safeName}-evaluation-report.docx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}
