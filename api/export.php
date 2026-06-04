<?php
require_once __DIR__ . '/db.php';

$batchId = (int) ($_GET['batch_id'] ?? 0);
$format = strtolower(trim((string) ($_GET['format'] ?? 'excel')));

if ($batchId <= 0) {
    http_response_code(400);
    echo 'Batch ID is required.';
    exit;
}

$mysqli = open_tmis_connection();
ensure_batch_training_columns($mysqli);
ensure_evaluation_training_columns($mysqli);

$batchStmt = $mysqli->prepare('
    SELECT name, batch_date, rp_code, training_code, resource_person_name, topic_delivered
    FROM tmis_batches
    WHERE id = ?
');
$batchStmt->bind_param('i', $batchId);
$batchStmt->execute();
$batch = $batchStmt->get_result()->fetch_assoc();

if (!$batch) {
    http_response_code(404);
    echo 'Batch not found.';
    exit;
}

$stmt = $mysqli->prepare("
    SELECT
        respondent_name,
        rp_code,
        training_code,
        resource_person_name,
        topic_delivered,
        topic_evaluations,
        training_title,
        delivery_date,
        clarity_objectives,
        topic_organization,
        clarity_presentation,
        instructional_aids_quality,
        teaching_ability,
        question_answering_ability,
        participant_interest,
        time_management,
        topic_ending,
        overall_satisfaction,
        liked_about_rp,
        disliked_about_rp,
        other_remarks,
        created_at
    FROM tmis_evaluations
    WHERE batch_id = ?
    ORDER BY created_at DESC
");
$stmt->bind_param('i', $batchId);
$stmt->execute();
$result = $stmt->get_result();
$rows = [];

while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}

$safeName = preg_replace('/[^A-Za-z0-9_-]+/', '-', $batch['name']);
$fileName = trim($safeName, '-') ?: 'batch';

$criteria = [
    ['label' => 'Clarity of the topic objectives at the beginning', 'short_label' => 'Clarity Objectives', 'field' => 'clarity_objectives'],
    ['label' => 'Organization/sequencing of Topic', 'short_label' => 'Topic Organization', 'field' => 'topic_organization'],
    ['label' => 'Clarity of topic/ideas presented/discussed', 'short_label' => 'Clarity Presentation', 'field' => 'clarity_presentation'],
    ['label' => 'Quality and effectiveness of instructional aids used', 'short_label' => 'Instructional Aids Quality', 'field' => 'instructional_aids_quality'],
    ['label' => 'Ability to teach/communicate ideas', 'short_label' => 'Teaching Ability', 'field' => 'teaching_ability'],
    ['label' => 'Ability to answer questions', 'short_label' => 'Question Answering Ability', 'field' => 'question_answering_ability'],
    ['label' => 'Ability to arouse/sustain interest', 'short_label' => 'Participant Interest', 'field' => 'participant_interest'],
    ['label' => 'Ability to manage time', 'short_label' => 'Time Management', 'field' => 'time_management'],
    ['label' => 'How the topic was ended', 'short_label' => 'Topic Ending', 'field' => 'topic_ending'],
    ['label' => 'Overall level of satisfaction', 'short_label' => 'Overall Satisfaction', 'field' => 'overall_satisfaction'],
];

function cell($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function first_filled(array $values): string
{
    foreach ($values as $value) {
        $value = trim((string) $value);

        if ($value !== '') {
            return $value;
        }
    }

    return '';
}

function format_report_date(?string $value): string
{
    $value = trim((string) $value);

    if ($value === '') {
        return '';
    }

    $timestamp = strtotime($value);

    return $timestamp ? date('F j, Y', $timestamp) : $value;
}

function split_lines(string $value): array
{
    return array_values(array_filter(array_map('trim', preg_split('/\r\n|\r|\n|;/', $value))));
}

function image_data_uri(string $path, string $mime): string
{
    if (!is_file($path)) {
        return '';
    }

    return 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($path));
}

function build_summary(array $rows, array $criteria): array
{
    $respondentCount = count($rows);
    $ratingTotals = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
    $summary = [];

    foreach ($criteria as $criterion) {
        $counts = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];

        foreach ($rows as $row) {
            $rating = (int) $row[$criterion['field']];

            if (isset($counts[$rating])) {
                $counts[$rating]++;
            }
        }

        $percentages = [];

        foreach ([1, 2, 3, 4, 5] as $rating) {
            $percentage = $respondentCount ? ($counts[$rating] / $respondentCount) * 100 : 0;
            $ratingTotals[$rating] += $percentage;
            $percentages[$rating] = $percentage;
        }

        $summary[] = [
            'criterion' => $criterion,
            'percentages' => $percentages,
        ];
    }

    $averages = [];

    foreach ([1, 2, 3, 4, 5] as $rating) {
        $averages[$rating] = count($criteria) ? $ratingTotals[$rating] / count($criteria) : 0;
    }

    return [$summary, $averages];
}

function percentage_text(float $value): string
{
    return $value > 0 ? number_format($value, 2) . '%' : '';
}

function add_unique_comment(array &$comments, string $comment): void
{
    $comment = preg_replace('/\s+/', ' ', trim($comment));

    if ($comment === '') {
        return;
    }

    $key = strtolower($comment);

    if (!array_key_exists($key, $comments)) {
        $comments[$key] = $comment;
    }
}

function build_report_comments(array $rows): array
{
    $liked = [];
    $improvements = [];
    $remarks = [];

    foreach (array_reverse($rows) as $row) {
        add_unique_comment($liked, (string) ($row['liked_about_rp'] ?? ''));
        add_unique_comment($improvements, (string) ($row['disliked_about_rp'] ?? ''));
        add_unique_comment($remarks, (string) ($row['other_remarks'] ?? ''));
    }

    $balanced = [];
    $groups = [array_values($liked), array_values($improvements), array_values($remarks)];

    while (count($balanced) < 5) {
        $added = false;

        foreach ($groups as $groupIndex => $group) {
            if (!empty($groups[$groupIndex])) {
                $balanced[] = array_shift($groups[$groupIndex]);
                $added = true;

                if (count($balanced) >= 5) {
                    break;
                }
            }
        }

        if (!$added) {
            break;
        }
    }

    while (count($balanced) < 5) {
        $balanced[] = 'No additional respondent comment was provided for this item.';
    }

    return array_slice($balanced, 0, 5);
}

function docx_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
}

function docx_run(string $text, array $options = []): string
{
    $properties = '';

    if (!empty($options['bold'])) {
        $properties .= '<w:b/>';
    }

    if (!empty($options['color'])) {
        $properties .= '<w:color w:val="' . docx_escape($options['color']) . '"/>';
    }

    if (!empty($options['size'])) {
        $properties .= '<w:sz w:val="' . (int) $options['size'] . '"/>';
    }

    $propertyXml = $properties !== '' ? '<w:rPr>' . $properties . '</w:rPr>' : '';
    $parts = preg_split('/\r\n|\r|\n/', $text);
    $textXml = '';

    foreach ($parts as $index => $part) {
        if ($index > 0) {
            $textXml .= '<w:br/>';
        }

        $textXml .= '<w:t xml:space="preserve">' . docx_escape($part) . '</w:t>';
    }

    return '<w:r>' . $propertyXml . $textXml . '</w:r>';
}

function docx_paragraph($runs = '', array $options = []): string
{
    if (is_array($runs)) {
        $runs = implode('', $runs);
    }

    $properties = '';

    if (!empty($options['align'])) {
        $properties .= '<w:jc w:val="' . docx_escape($options['align']) . '"/>';
    }

    if (array_key_exists('after', $options) || array_key_exists('before', $options)) {
        $properties .= '<w:spacing w:before="' . (int) ($options['before'] ?? 0) . '" w:after="' . (int) ($options['after'] ?? 0) . '"/>';
    }

    $propertyXml = $properties !== '' ? '<w:pPr>' . $properties . '</w:pPr>' : '';

    return '<w:p>' . $propertyXml . $runs . '</w:p>';
}

function docx_text_paragraph(string $text, array $runOptions = [], array $paragraphOptions = []): string
{
    return docx_paragraph(docx_run($text, $runOptions), $paragraphOptions);
}

function docx_image(string $relationshipId, int $widthEmu, int $heightEmu): string
{
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
        . '<wp:extent cx="' . $widthEmu . '" cy="' . $heightEmu . '"/>'
        . '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        . '<wp:docPr id="' . preg_replace('/\D+/', '', $relationshipId) . '" name="Logo"/>'
        . '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        . '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        . '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        . '<pic:nvPicPr><pic:cNvPr id="0" name="Logo"/><pic:cNvPicPr/></pic:nvPicPr>'
        . '<pic:blipFill><a:blip r:embed="' . docx_escape($relationshipId) . '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        . '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' . $widthEmu . '" cy="' . $heightEmu . '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        . '</pic:pic></a:graphicData></a:graphic>'
        . '</wp:inline></w:drawing></w:r>';
}

function docx_cell(string $content, int $width, array $options = []): string
{
    $properties = '<w:tcW w:w="' . $width . '" w:type="dxa"/>';

    if (!empty($options['gridSpan'])) {
        $properties .= '<w:gridSpan w:val="' . (int) $options['gridSpan'] . '"/>';
    }

    if (!empty($options['vMerge'])) {
        $properties .= '<w:vMerge' . ($options['vMerge'] === 'restart' ? ' w:val="restart"' : '') . '/>';
    }

    if (!empty($options['valign'])) {
        $properties .= '<w:vAlign w:val="' . docx_escape($options['valign']) . '"/>';
    }

    return '<w:tc><w:tcPr>' . $properties . '</w:tcPr>' . $content . '</w:tc>';
}

function docx_table(array $rows, array $widths, array $options = []): string
{
    $borderSize = (int) ($options['borderSize'] ?? 4);
    $width = array_sum($widths);
    $borderXml = !empty($options['borderless'])
        ? ''
        : '<w:tblBorders><w:top w:val="single" w:sz="' . $borderSize . '" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="' . $borderSize . '" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="' . $borderSize . '" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="' . $borderSize . '" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="' . $borderSize . '" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="' . $borderSize . '" w:space="0" w:color="000000"/></w:tblBorders>';
    $xml = '<w:tbl><w:tblPr><w:tblW w:w="' . $width . '" w:type="dxa"/><w:tblCellMar><w:top w:w="20" w:type="dxa"/><w:left w:w="45" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="45" w:type="dxa"/></w:tblCellMar>' . $borderXml . '</w:tblPr>';

    foreach ($rows as $row) {
        $xml .= '<w:tr>';

        foreach ($row as $cell) {
            $xml .= $cell;
        }

        $xml .= '</w:tr>';
    }

    return $xml . '</w:tbl>';
}

function docx_empty_paragraph(int $after = 0): string
{
    return docx_paragraph('', ['after' => $after]);
}

function create_evaluation_docx(
    string $path,
    array $batch,
    array $rows,
    array $summary,
    array $averages,
    string $activityTitle,
    string $dateAndTime,
    string $resourcePerson,
    array $topics,
    array $comments
): bool {
    if (!class_exists('ZipArchive')) {
        return false;
    }

    $bagongLogoPath = __DIR__ . '/../images/Bagongpilipinas.png';
    $atiLogoPath = __DIR__ . '/../images/ati logo.png';
    $hasBagongLogo = is_file($bagongLogoPath);
    $hasAtiLogo = is_file($atiLogoPath);

    $relationships = '';
    $logoRuns = [];
    $relationshipNumber = 1;

    if ($hasBagongLogo) {
        $relationships .= '<Relationship Id="rId' . $relationshipNumber . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/bagongpilipinas.png"/>';
        $logoRuns[] = docx_image('rId' . $relationshipNumber, 640000, 640000);
        $relationshipNumber++;
    }

    if ($hasAtiLogo) {
        $relationships .= '<Relationship Id="rId' . $relationshipNumber . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/ati-logo.png"/>';
        $logoRuns[] = docx_image('rId' . $relationshipNumber, 740000, 740000);
    }

    $body = '';
    $body .= docx_table([
        [
            docx_cell(docx_paragraph($logoRuns, ['align' => 'right']), 3600),
            docx_cell(
                docx_paragraph([
                    docx_run("Republic of the Philippines\nDepartment of Agriculture\n", ['size' => 15]),
                    docx_run("AGRICULTURAL TRAINING INSTITUTE\n", ['bold' => true, 'color' => '18A45B', 'size' => 24]),
                    docx_run("Regional Training Center-13\n", ['bold' => true, 'size' => 20]),
                    docx_run("Los Angeles, Butuan City\nMobile Nos.: (+63)945-3926484\ne-Mail: ati.caraga@ati.da.gov.ph\nURL: https://ati2.da.gov.ph/ati-13; www.e-extension.gov.ph", ['size' => 15]),
                ]),
                5200
            ),
        ],
    ], [3600, 5200], ['borderless' => true]);
    $body .= docx_text_paragraph('RESULTS OF THE RESOURCE PERSON EVALUATION', ['bold' => true, 'size' => 20], ['align' => 'center', 'before' => 120, 'after' => 320]);
    $body .= docx_table([
        [
            docx_cell(docx_text_paragraph('Activity Title:', ['size' => 19]), 2200),
            docx_cell(docx_text_paragraph($activityTitle, ['size' => 19]), 6600),
        ],
        [
            docx_cell(docx_text_paragraph('Date and Time:', ['size' => 19]), 2200),
            docx_cell(docx_text_paragraph($dateAndTime, ['size' => 19]), 6600),
        ],
        [
            docx_cell(docx_text_paragraph('Name of Resource Person:', ['size' => 19]), 2200),
            docx_cell(docx_text_paragraph($resourcePerson, ['size' => 19]), 6600),
        ],
        [
            docx_cell(docx_text_paragraph('Topic/s Delivered:', ['size' => 19]), 2200, ['valign' => 'top']),
            docx_cell(docx_text_paragraph(implode("\n", array_map(static fn($topic, $index) => 'Module ' . ($index + 1) . ': ' . $topic, $topics, array_keys($topics))), ['size' => 19]), 6600),
        ],
    ], [2200, 6600], ['borderless' => true]);
    $body .= docx_text_paragraph('The rating guide for the criteria is in Likert Scale format as the following:', ['size' => 19], ['before' => 100, 'after' => 40]);

    $guideRows = [
        [
            docx_cell(docx_text_paragraph('Numerical Rating', ['bold' => true, 'size' => 18], ['align' => 'center']), 3000),
            docx_cell(docx_text_paragraph('Adjectival Rating', ['bold' => true, 'size' => 18], ['align' => 'center']), 3000),
        ],
    ];

    foreach ([1 => 'Poor', 2 => 'Fair', 3 => 'Satisfactorily', 4 => 'Very Satisfactorily', 5 => 'Excellent'] as $rating => $label) {
        $guideRows[] = [
            docx_cell(docx_text_paragraph((string) $rating, ['size' => 18], ['align' => 'center']), 3000),
            docx_cell(docx_text_paragraph($label, ['size' => 18], ['align' => 'center']), 3000),
        ];
    }

    $body .= docx_table($guideRows, [3000, 3000]);
    $body .= docx_text_paragraph('Results per criteria', ['size' => 18], ['before' => 55, 'after' => 15]);

    $resultRows = [
        [
            docx_cell(docx_text_paragraph('Criteria', ['bold' => true, 'size' => 17], ['align' => 'center']), 4700, ['vMerge' => 'restart']),
            docx_cell(docx_text_paragraph('Percentage of Participants', ['bold' => true, 'size' => 17], ['align' => 'center']), 4100, ['gridSpan' => 5]),
        ],
        [
            docx_cell(docx_empty_paragraph(), 4700, ['vMerge' => 'continue']),
            docx_cell(docx_text_paragraph('1', ['size' => 17], ['align' => 'center']), 820),
            docx_cell(docx_text_paragraph('2', ['size' => 17], ['align' => 'center']), 820),
            docx_cell(docx_text_paragraph('3', ['size' => 17], ['align' => 'center']), 820),
            docx_cell(docx_text_paragraph('4', ['size' => 17], ['align' => 'center']), 820),
            docx_cell(docx_text_paragraph('5', ['size' => 17], ['align' => 'center']), 820),
        ],
    ];

    foreach ($summary as $index => $item) {
        $row = [
            docx_cell(docx_text_paragraph(($index + 1) . '. ' . $item['criterion']['label'], ['size' => 16]), 4700),
        ];

        foreach ([1, 2, 3, 4, 5] as $rating) {
            $row[] = docx_cell(docx_text_paragraph(percentage_text($item['percentages'][$rating]), ['size' => 16], ['align' => 'center']), 820);
        }

        $resultRows[] = $row;
    }

    $averageRow = [
        docx_cell(docx_text_paragraph('AVERAGE', ['bold' => true, 'size' => 16], ['align' => 'center']), 4700),
    ];

    foreach ([1, 2, 3, 4, 5] as $rating) {
        $averageRow[] = docx_cell(docx_text_paragraph(percentage_text($averages[$rating]), ['bold' => true, 'size' => 16], ['align' => 'center']), 820);
    }

    $resultRows[] = $averageRow;
    $body .= docx_table($resultRows, [4700, 820, 820, 820, 820, 820]);
    $body .= docx_text_paragraph('Comments and Suggestions:', ['bold' => true, 'size' => 18], ['before' => 20, 'after' => 0]);

    foreach ($comments as $index => $comment) {
        $body .= docx_paragraph([
            docx_run(($index + 1) . '. ', ['size' => 17]),
            docx_run($comment, ['size' => 17]),
        ], ['after' => 0]);
    }

    $body .= docx_text_paragraph('Thank you!', ['bold' => true, 'size' => 18], ['align' => 'center', 'before' => 70, 'after' => 260]);
    $body .= docx_text_paragraph("ISO 9001:2015 Certified\nC.R. No.: TUV 100 05 3040", ['color' => '808080', 'size' => 13], ['align' => 'center']);

    $documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">'
        . '<w:body>' . $body . '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="504" w:right="792" w:bottom="576" w:left="792" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>';

    $zip = new ZipArchive();

    if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        return false;
    }

    $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    $zip->addFromString('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $relationships . '</Relationships>');
    $zip->addFromString('word/document.xml', $documentXml);

    if ($hasBagongLogo) {
        $zip->addFile($bagongLogoPath, 'word/media/bagongpilipinas.png');
    }

    if ($hasAtiLogo) {
        $zip->addFile($atiLogoPath, 'word/media/ati-logo.png');
    }

    return $zip->close();
}

[$summary, $averages] = build_summary($rows, $criteria);

if ($format === 'word' || $format === 'doc' || $format === 'docs') {
    $firstRow = $rows[0] ?? [];
    $activityTitle = first_filled([$firstRow['training_title'] ?? '', $batch['name']]);
    $dateAndTime = format_report_date(first_filled([$firstRow['delivery_date'] ?? '', $batch['batch_date']]));
    $resourcePerson = first_filled([$firstRow['resource_person_name'] ?? '', $batch['resource_person_name']]);
    $topicDelivered = first_filled([$firstRow['topic_delivered'] ?? '', $batch['topic_delivered']]);
    $topics = split_lines($topicDelivered);
    $comments = build_report_comments($rows);

    if (!$topics) {
        $topics = [''];
    }

    $tempFile = tempnam(sys_get_temp_dir(), 'arrpe-docx-');

    if ($tempFile === false || !create_evaluation_docx(
        $tempFile,
        $batch,
        $rows,
        $summary,
        $averages,
        $activityTitle,
        $dateAndTime,
        $resourcePerson,
        $topics,
        $comments
    )) {
        http_response_code(500);
        echo 'Unable to generate Word document.';
        exit;
    }

    header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    header('Content-Disposition: attachment; filename="' . $fileName . '-evaluation-report.docx"');
    header('Content-Length: ' . filesize($tempFile));
    header('Pragma: no-cache');
    header('Expires: 0');

    readfile($tempFile);
    unlink($tempFile);
    exit;
}

header('Content-Type: application/vnd.ms-excel; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $fileName . '-evaluations.xls"');
header('Pragma: no-cache');
header('Expires: 0');

echo "<table border=\"1\">";
echo '<tr><th colspan="23">' . cell($batch['name']) . ' - ' . cell($batch['batch_date']) . '</th></tr>';
echo '<tr><th colspan="23">Results per criteria</th></tr>';
echo '<tr><th rowspan="2">Criteria</th><th colspan="5">Percentage of Participants</th></tr>';
echo '<tr><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr>';

foreach ($summary as $item) {
    echo '<tr><td>' . cell($item['criterion']['short_label']) . '</td>';

    foreach ([1, 2, 3, 4, 5] as $rating) {
        echo '<td>' . cell(percentage_text($item['percentages'][$rating])) . '</td>';
    }

    echo '</tr>';
}

echo '<tr><td><strong>AVERAGE</strong></td>';

foreach ([1, 2, 3, 4, 5] as $rating) {
    echo '<td><strong>' . cell(percentage_text($averages[$rating])) . '</strong></td>';
}

echo '</tr>';
echo '<tr><td colspan="23"></td></tr>';
echo '<tr>';

$headers = [
    'Respondent',
    'RP Code',
    'Training Code',
    'Resource Person',
    'Topic/s Delivered',
    'Topic Evaluation',
    'Training Title',
    'Delivery Date',
    'Clarity Objectives',
    'Topic Organization',
    'Clarity Presentation',
    'Instructional Aids Quality',
    'Teaching Ability',
    'Question Answering Ability',
    'Participant Interest',
    'Time Management',
    'Topic Ending',
    'Overall Satisfaction',
    'Average',
    'Liked About RP',
    'Disliked About RP',
    'Other Remarks',
    'Created At',
];

foreach ($headers as $header) {
    echo '<th>' . cell($header) . '</th>';
}

echo '</tr>';

foreach ($rows as $row) {
    $scores = [
        (int) $row['clarity_objectives'],
        (int) $row['topic_organization'],
        (int) $row['clarity_presentation'],
        (int) $row['instructional_aids_quality'],
        (int) $row['teaching_ability'],
        (int) $row['question_answering_ability'],
        (int) $row['participant_interest'],
        (int) $row['time_management'],
        (int) $row['topic_ending'],
        (int) $row['overall_satisfaction'],
    ];

    $values = [
        $row['respondent_name'],
        $row['rp_code'],
        $row['training_code'],
        $row['resource_person_name'],
        $row['topic_delivered'],
        $row['topic_evaluations'],
        $row['training_title'],
        $row['delivery_date'],
        $row['clarity_objectives'],
        $row['topic_organization'],
        $row['clarity_presentation'],
        $row['instructional_aids_quality'],
        $row['teaching_ability'],
        $row['question_answering_ability'],
        $row['participant_interest'],
        $row['time_management'],
        $row['topic_ending'],
        $row['overall_satisfaction'],
        number_format(array_sum($scores) / count($scores), 2, '.', ''),
        $row['liked_about_rp'],
        $row['disliked_about_rp'],
        $row['other_remarks'],
        $row['created_at'],
    ];

    echo '<tr>';
    foreach ($values as $value) {
        echo '<td>' . cell($value) . '</td>';
    }
    echo '</tr>';
}

echo '</table>';
