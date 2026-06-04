<?php

require_once __DIR__ . '/db.php';

configure_json_api(['GET', 'POST', 'PUT', 'DELETE']);

$mysqli = open_tmis_connection();
ensure_batch_training_columns($mysqli);
ensure_evaluation_training_columns($mysqli);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = copy_payload_aliases(read_json_payload(), [
        'rp_code' => 'rpCode',
        'training_code' => 'trainingCode',
        'resource_person_name' => 'resourcePersonName',
        'topic_delivered' => 'topicDelivered',
    ]);
    $name = trim((string) ($data['name'] ?? ''));
    $date = trim((string) ($data['date'] ?? ''));
    $rpCode = trim((string) ($data['rp_code'] ?? ''));
    $trainingCode = trim((string) ($data['training_code'] ?? ''));
    $resourcePersonName = trim((string) ($data['resource_person_name'] ?? ''));
    $topicDelivered = trim((string) ($data['topic_delivered'] ?? ''));

    if ($name === '' || $date === '' || $rpCode === '' || $trainingCode === '' || $resourcePersonName === '' || $topicDelivered === '') {
        send_json_response([
            'success' => false,
            'message' => 'Batch name, date, RP code, training code, resource person, and topic/s delivered are required.',
        ], 400);
    }

    $stmt = $mysqli->prepare('
        INSERT INTO tmis_batches (name, batch_date, rp_code, training_code, resource_person_name, topic_delivered)
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $stmt->bind_param('ssssss', $name, $date, $rpCode, $trainingCode, $resourcePersonName, $topicDelivered);

    if (!$stmt->execute()) {
        send_json_response([
            'success' => false,
            'message' => 'Failed to create batch.',
            'details' => $stmt->error,
        ], 500);
    }

    $batch = [
        'id' => $stmt->insert_id,
        'name' => $name,
        'date' => $date,
        'rpCode' => $rpCode,
        'trainingCode' => $trainingCode,
        'resourcePersonName' => $resourcePersonName,
        'topicDelivered' => $topicDelivered,
        'evaluations' => [],
    ];

    send_json_response([
        'success' => true,
        'message' => 'Batch created successfully.',
        'batch' => $batch,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $data = copy_payload_aliases(read_json_payload(), [
        'rp_code' => 'rpCode',
        'training_code' => 'trainingCode',
        'resource_person_name' => 'resourcePersonName',
        'topic_delivered' => 'topicDelivered',
    ]);
    $id = (int) ($data['id'] ?? 0);
    $name = trim((string) ($data['name'] ?? ''));
    $date = trim((string) ($data['date'] ?? ''));
    $rpCode = trim((string) ($data['rp_code'] ?? ''));
    $trainingCode = trim((string) ($data['training_code'] ?? ''));
    $resourcePersonName = trim((string) ($data['resource_person_name'] ?? ''));
    $topicDelivered = trim((string) ($data['topic_delivered'] ?? ''));

    if ($id <= 0 || $name === '' || $date === '' || $rpCode === '' || $trainingCode === '' || $resourcePersonName === '' || $topicDelivered === '') {
        send_json_response([
            'success' => false,
            'message' => 'Batch ID, name, date, RP code, training code, resource person, and topic/s delivered are required.',
        ], 400);
    }

    $stmt = $mysqli->prepare('
        UPDATE tmis_batches
        SET name = ?, batch_date = ?, rp_code = ?, training_code = ?, resource_person_name = ?, topic_delivered = ?
        WHERE id = ?
    ');
    $stmt->bind_param('ssssssi', $name, $date, $rpCode, $trainingCode, $resourcePersonName, $topicDelivered, $id);

    if (!$stmt->execute()) {
        send_json_response([
            'success' => false,
            'message' => 'Failed to update batch.',
            'details' => $stmt->error,
        ], 500);
    }

    send_json_response([
        'success' => true,
        'message' => 'Batch updated successfully.',
        'batch' => [
            'id' => $id,
            'name' => $name,
            'date' => $date,
            'rpCode' => $rpCode,
            'trainingCode' => $trainingCode,
            'resourcePersonName' => $resourcePersonName,
            'topicDelivered' => $topicDelivered,
        ],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $data = read_json_payload();
    $id = (int) ($data['id'] ?? 0);

    if ($id <= 0) {
        send_json_response([
            'success' => false,
            'message' => 'Batch ID is required.',
        ], 400);
    }

    $mysqli->begin_transaction();

    try {
        $entryStmt = $mysqli->prepare('DELETE FROM tmis_evaluations WHERE batch_id = ?');
        $entryStmt->bind_param('i', $id);
        $entryStmt->execute();
        $deletedEntries = $entryStmt->affected_rows;

        $batchStmt = $mysqli->prepare('DELETE FROM tmis_batches WHERE id = ?');
        $batchStmt->bind_param('i', $id);
        $batchStmt->execute();

        if ($batchStmt->affected_rows < 1) {
            throw new RuntimeException('Batch was not found.');
        }

        $mysqli->commit();

        send_json_response([
            'success' => true,
            'message' => 'Batch and its evaluation entries were deleted successfully.',
            'id' => $id,
            'deleted_entries' => $deletedEntries,
        ]);
    } catch (Throwable $error) {
        $mysqli->rollback();

        send_json_response([
            'success' => false,
            'message' => 'Failed to delete batch.',
            'details' => $error->getMessage(),
        ], 500);
    }
}

$search = trim((string) ($_GET['q'] ?? ''));
$where = '';
$params = [];
$types = '';

if ($search !== '') {
    $where = 'WHERE b.name LIKE ? OR b.batch_date LIKE ? OR b.rp_code LIKE ? OR b.training_code LIKE ? OR b.resource_person_name LIKE ? OR b.topic_delivered LIKE ?';
    $like = '%' . $search . '%';
    $params = [$like, $like, $like, $like, $like, $like];
    $types = 'ssssss';
}

$sql = "
    SELECT
        b.id AS batch_id,
        b.name AS batch_name,
        b.batch_date,
        b.rp_code AS batch_rp_code,
        b.training_code AS batch_training_code,
        b.resource_person_name AS batch_resource_person_name,
        b.topic_delivered AS batch_topic_delivered,
        e.id AS evaluation_id,
        e.respondent_name,
        e.rp_code,
        e.training_code,
        e.resource_person_name,
        e.topic_delivered,
        e.topic_evaluations,
        e.training_title,
        e.delivery_date,
        e.clarity_objectives,
        e.topic_organization,
        e.clarity_presentation,
        e.instructional_aids_quality,
        e.teaching_ability,
        e.question_answering_ability,
        e.participant_interest,
        e.time_management,
        e.topic_ending,
        e.overall_satisfaction,
        e.liked_about_rp,
        e.disliked_about_rp,
        e.other_remarks,
        e.created_at AS evaluation_created_at
    FROM tmis_batches b
    LEFT JOIN tmis_evaluations e ON e.batch_id = b.id
    {$where}
    ORDER BY b.created_at DESC, e.created_at DESC
";

$stmt = $mysqli->prepare($sql);

if ($params) {
    $stmt->bind_param($types, ...$params);
}

if (!$stmt->execute()) {
    send_json_response([
        'success' => false,
        'message' => 'Failed to load batches.',
        'details' => $stmt->error,
    ], 500);
}

$result = $stmt->get_result();
$batches = [];

while ($row = $result->fetch_assoc()) {
    $batchId = (int) $row['batch_id'];

    if (!isset($batches[$batchId])) {
        $batches[$batchId] = [
            'id' => $batchId,
            'name' => $row['batch_name'],
            'date' => $row['batch_date'],
            'rpCode' => $row['batch_rp_code'],
            'trainingCode' => $row['batch_training_code'],
            'resourcePersonName' => $row['batch_resource_person_name'],
            'topicDelivered' => $row['batch_topic_delivered'] ?? '',
            'evaluations' => [],
        ];
    }

    if ($row['evaluation_id'] !== null) {
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

        $batches[$batchId]['evaluations'][] = [
            'id' => (int) $row['evaluation_id'],
            'respondentName' => $row['respondent_name'],
            'rpCode' => $row['rp_code'],
            'trainingCode' => $row['training_code'],
            'resourcePersonName' => $row['resource_person_name'],
            'topicDelivered' => $row['topic_delivered'] ?? '',
            'topicEvaluations' => $row['topic_evaluations'] ?? '',
            'trainingTitle' => $row['training_title'],
            'deliveryDate' => $row['delivery_date'],
            'clarityObjectives' => (int) $row['clarity_objectives'],
            'topicOrganization' => (int) $row['topic_organization'],
            'clarityPresentation' => (int) $row['clarity_presentation'],
            'instructionalAidsQuality' => (int) $row['instructional_aids_quality'],
            'teachingAbility' => (int) $row['teaching_ability'],
            'questionAnsweringAbility' => (int) $row['question_answering_ability'],
            'participantInterest' => (int) $row['participant_interest'],
            'timeManagement' => (int) $row['time_management'],
            'topicEnding' => (int) $row['topic_ending'],
            'overallSatisfaction' => (int) $row['overall_satisfaction'],
            'likedAboutRP' => $row['liked_about_rp'] ?? '',
            'dislikedAboutRP' => $row['disliked_about_rp'] ?? '',
            'otherRemarks' => $row['other_remarks'] ?? '',
            'averageScore' => number_format(array_sum($scores) / count($scores), 2, '.', ''),
            'submittedAt' => $row['evaluation_created_at'],
        ];
    }
}

send_json_response([
    'success' => true,
    'batches' => array_values($batches),
]);
