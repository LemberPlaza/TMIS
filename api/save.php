<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

configure_json_api(['POST']);

$data = copy_payload_aliases(read_json_payload(), [
    'batch_id' => 'batchId',
    'respondent_name' => 'respondentName',
    'rp_code' => 'rpCode',
    'training_code' => 'trainingCode',
    'resource_person_name' => 'resourcePersonName',
    'topic_delivered' => 'topicDelivered',
    'topic_evaluations' => 'topicEvaluations',
    'training_title' => 'trainingTitle',
    'delivery_date' => 'deliveryDate',
    'clarity_objectives' => 'clarityObjectives',
    'topic_organization' => 'topicOrganization',
    'clarity_presentation' => 'clarityPresentation',
    'instructional_aids_quality' => 'instructionalAidsQuality',
    'teaching_ability' => 'teachingAbility',
    'question_answering_ability' => 'questionAnsweringAbility',
    'participant_interest' => 'participantInterest',
    'time_management' => 'timeManagement',
    'topic_ending' => 'topicEnding',
    'overall_satisfaction' => 'overallSatisfaction',
    'liked_about_rp' => 'likedAboutRP',
    'disliked_about_rp' => 'dislikedAboutRP',
    'other_remarks' => 'otherRemarks',
]);

$requiredFields = [
    'batch_id',
    'respondent_name',
    'rp_code',
    'training_code',
    'resource_person_name',
    'topic_delivered',
    'training_title',
    'delivery_date',
    'clarity_objectives',
    'topic_organization',
    'clarity_presentation',
    'instructional_aids_quality',
    'teaching_ability',
    'question_answering_ability',
    'participant_interest',
    'time_management',
    'topic_ending',
    'overall_satisfaction',
];

foreach ($requiredFields as $field) {
    if (!array_key_exists($field, $data) || trim((string) $data[$field]) === '') {
        send_json_response([
            'success' => false,
            'message' => "Missing required field: {$field}",
        ], 400);
    }
}

$scoreFields = [
    'clarity_objectives',
    'topic_organization',
    'clarity_presentation',
    'instructional_aids_quality',
    'teaching_ability',
    'question_answering_ability',
    'participant_interest',
    'time_management',
    'topic_ending',
    'overall_satisfaction',
];

foreach ($scoreFields as $scoreField) {
    if (!is_numeric($data[$scoreField])) {
        send_json_response([
            'success' => false,
            'message' => "Field {$scoreField} must be numeric between 1 and 5.",
        ], 400);
    }

    $value = (int) $data[$scoreField];

    if ($value < 1 || $value > 5) {
        send_json_response([
            'success' => false,
            'message' => "Field {$scoreField} must be between 1 and 5.",
        ], 400);
    }
}

$mysqli = open_tmis_connection();
ensure_batch_training_columns($mysqli);
ensure_evaluation_training_columns($mysqli);
$batchId = (int) $data['batch_id'];

$batchStmt = $mysqli->prepare('SELECT id FROM tmis_batches WHERE id = ?');
$batchStmt->bind_param('i', $batchId);
$batchStmt->execute();

if (!$batchStmt->get_result()->fetch_assoc()) {
    send_json_response([
        'success' => false,
        'message' => 'Selected batch was not found in the database.',
    ], 404);
}

$stmt = $mysqli->prepare("
    INSERT INTO tmis_evaluations (
        batch_id,
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
        other_remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
");

$respondentName = trim((string) $data['respondent_name']);
$rpCode = trim((string) $data['rp_code']);
$trainingCode = trim((string) $data['training_code']);
$resourcePersonName = trim((string) $data['resource_person_name']);
$topicDelivered = trim((string) $data['topic_delivered']);
$topicEvaluations = is_array($data['topic_evaluations'] ?? null)
    ? json_encode($data['topic_evaluations'])
    : trim((string) ($data['topic_evaluations'] ?? ''));
$trainingTitle = trim((string) $data['training_title']);
$deliveryDate = trim((string) $data['delivery_date']);
$clarityObjectives = (int) $data['clarity_objectives'];
$topicOrganization = (int) $data['topic_organization'];
$clarityPresentation = (int) $data['clarity_presentation'];
$instructionalAidsQuality = (int) $data['instructional_aids_quality'];
$teachingAbility = (int) $data['teaching_ability'];
$questionAnsweringAbility = (int) $data['question_answering_ability'];
$participantInterest = (int) $data['participant_interest'];
$timeManagement = (int) $data['time_management'];
$topicEnding = (int) $data['topic_ending'];
$overallSatisfaction = (int) $data['overall_satisfaction'];
$likedAboutRP = trim((string) ($data['liked_about_rp'] ?? ''));
$dislikedAboutRP = trim((string) ($data['disliked_about_rp'] ?? ''));
$otherRemarks = trim((string) ($data['other_remarks'] ?? ''));

$stmt->bind_param(
    'issssssssiiiiiiiiiisss',
    $batchId,
    $respondentName,
    $rpCode,
    $trainingCode,
    $resourcePersonName,
    $topicDelivered,
    $topicEvaluations,
    $trainingTitle,
    $deliveryDate,
    $clarityObjectives,
    $topicOrganization,
    $clarityPresentation,
    $instructionalAidsQuality,
    $teachingAbility,
    $questionAnsweringAbility,
    $participantInterest,
    $timeManagement,
    $topicEnding,
    $overallSatisfaction,
    $likedAboutRP,
    $dislikedAboutRP,
    $otherRemarks
);

if (!$stmt->execute()) {
    send_json_response([
        'success' => false,
        'message' => 'Failed to save evaluation.',
        'details' => $stmt->error,
    ], 500);
}

$batchUpdateStmt = $mysqli->prepare("
    UPDATE tmis_batches
    SET
        rp_code = CASE WHEN rp_code = '' THEN ? ELSE rp_code END,
        training_code = CASE WHEN training_code = '' THEN ? ELSE training_code END,
        resource_person_name = CASE WHEN resource_person_name = '' THEN ? ELSE resource_person_name END,
        topic_delivered = CASE WHEN topic_delivered IS NULL OR topic_delivered = '' THEN ? ELSE topic_delivered END
    WHERE id = ?
");
$batchUpdateStmt->bind_param('ssssi', $rpCode, $trainingCode, $resourcePersonName, $topicDelivered, $batchId);
$batchUpdateStmt->execute();

$scores = [
    $clarityObjectives,
    $topicOrganization,
    $clarityPresentation,
    $instructionalAidsQuality,
    $teachingAbility,
    $questionAnsweringAbility,
    $participantInterest,
    $timeManagement,
    $topicEnding,
    $overallSatisfaction,
];

send_json_response([
    'success' => true,
    'message' => 'TMIS evaluation saved successfully.',
    'id' => $stmt->insert_id,
    'evaluation' => [
        'id' => $stmt->insert_id,
        'respondentName' => $respondentName,
        'rpCode' => $rpCode,
        'trainingCode' => $trainingCode,
        'resourcePersonName' => $resourcePersonName,
        'topicDelivered' => $topicDelivered,
        'topicEvaluations' => $topicEvaluations,
        'trainingTitle' => $trainingTitle,
        'deliveryDate' => $deliveryDate,
        'clarityObjectives' => $clarityObjectives,
        'topicOrganization' => $topicOrganization,
        'clarityPresentation' => $clarityPresentation,
        'instructionalAidsQuality' => $instructionalAidsQuality,
        'teachingAbility' => $teachingAbility,
        'questionAnsweringAbility' => $questionAnsweringAbility,
        'participantInterest' => $participantInterest,
        'timeManagement' => $timeManagement,
        'topicEnding' => $topicEnding,
        'overallSatisfaction' => $overallSatisfaction,
        'likedAboutRP' => $likedAboutRP,
        'dislikedAboutRP' => $dislikedAboutRP,
        'otherRemarks' => $otherRemarks,
        'averageScore' => number_format(array_sum($scores) / count($scores), 2, '.', ''),
        'submittedAt' => date('Y-m-d H:i:s'),
    ],
]);
