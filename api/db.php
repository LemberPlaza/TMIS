<?php

function open_tmis_connection(): mysqli
{
    // $mysqli = new mysqli('localhost', 'root', '', 'tmis_db', 3306);
    $mysqli = new mysqli('arrpe-tmis-o0o6ca', 'tmis_user', 'TMIS@dbpass2026', 'tmis_db', 3306);

    if ($mysqli->connect_errno) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Database connection failed.',
            'details' => $mysqli->connect_error,
        ]);
        exit;
    }

    $mysqli->set_charset('utf8mb4');

    return $mysqli;
}

function send_json_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function configure_json_api(array $methods): void
{
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
    header('Access-Control-Allow-Methods: ' . implode(', ', array_merge($methods, ['OPTIONS'])));

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        send_json_response(['success' => true, 'message' => 'Preflight OK']);
    }

    if (!in_array($_SERVER['REQUEST_METHOD'], $methods, true)) {
        send_json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
    }
}

function read_json_payload(): array
{
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!is_array($data)) {
        send_json_response(['success' => false, 'message' => 'Invalid JSON payload.'], 400);
    }

    return $data;
}

function copy_payload_aliases(array $data, array $aliases): array
{
    foreach ($aliases as $target => $source) {
        $targetIsEmpty = !array_key_exists($target, $data)
            || (!is_array($data[$target]) && trim((string) $data[$target]) === '');

        if ($targetIsEmpty && array_key_exists($source, $data)) {
            $data[$target] = $data[$source];
        }
    }

    return $data;
}

function ensure_table_columns(mysqli $mysqli, string $tableName, array $columns): void
{
    foreach ($columns as $column => $alterSql) {
        $stmt = $mysqli->prepare("
            SELECT COUNT(*) AS column_count
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = ?
        ");
        $stmt->bind_param('ss', $tableName, $column);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();

        if ((int) ($row['column_count'] ?? 0) === 0 && !$mysqli->query($alterSql)) {
            send_json_response([
                'success' => false,
                'message' => "Failed to prepare {$tableName}.{$column}.",
                'details' => $mysqli->error,
            ], 500);
        }
    }
}

function ensure_batch_training_columns(mysqli $mysqli): void
{
    ensure_table_columns($mysqli, 'tmis_batches', [
        'rp_code' => "ALTER TABLE tmis_batches ADD COLUMN rp_code VARCHAR(100) NOT NULL DEFAULT '' AFTER batch_date",
        'training_code' => "ALTER TABLE tmis_batches ADD COLUMN training_code VARCHAR(100) NOT NULL DEFAULT '' AFTER rp_code",
        'resource_person_name' => "ALTER TABLE tmis_batches ADD COLUMN resource_person_name VARCHAR(255) NOT NULL DEFAULT '' AFTER training_code",
        'topic_delivered' => "ALTER TABLE tmis_batches ADD COLUMN topic_delivered TEXT NULL AFTER resource_person_name",
    ]);
}

function ensure_evaluation_training_columns(mysqli $mysqli): void
{
    ensure_table_columns($mysqli, 'tmis_evaluations', [
        'batch_id' => "ALTER TABLE tmis_evaluations ADD COLUMN batch_id INT UNSIGNED NULL AFTER id",
        'rp_code' => "ALTER TABLE tmis_evaluations ADD COLUMN rp_code VARCHAR(100) NOT NULL DEFAULT '' AFTER respondent_name",
        'training_code' => "ALTER TABLE tmis_evaluations ADD COLUMN training_code VARCHAR(100) NOT NULL DEFAULT '' AFTER rp_code",
        'resource_person_name' => "ALTER TABLE tmis_evaluations ADD COLUMN resource_person_name VARCHAR(255) NOT NULL DEFAULT '' AFTER training_code",
        'topic_delivered' => "ALTER TABLE tmis_evaluations ADD COLUMN topic_delivered TEXT NULL AFTER resource_person_name",
        'topic_evaluations' => "ALTER TABLE tmis_evaluations ADD COLUMN topic_evaluations TEXT NULL AFTER topic_delivered",
    ]);
}
