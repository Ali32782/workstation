<?php
/**
 * SnappyMail SSO bridge.
 *
 * Called server-to-server by the corehub portal to mint a one-shot
 * SSO hash for a given mailbox. The browser is then redirected to
 *   https://webmail.kineo360.work/?Sso&hash=<hash>
 * which logs the user in transparently.
 *
 * Auth: Bearer <SNAPPYMAIL_BRIDGE_TOKEN>
 *
 * Body (JSON): { "email": "user@domain", "password": "<derived>" }
 *
 * Response (JSON): { "hash": "<hash>" }
 *
 * Mounted into the SnappyMail webroot so it shares the SnappyMail
 * autoloader & cache backend (the Cache must be the same instance as
 * the one ServiceSso reads from).
 */

declare(strict_types=1);

header('Content-Type: application/json');
header('Cache-Control: no-store, max-age=0');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');

// PHP-FPM strips env vars by default — so we read the token from a
// mounted file at /etc/snappymail-bridge.token (root-owned, 0640).
$tokenFile = '/etc/snappymail-bridge.token';
$expectedToken = is_readable($tokenFile) ? trim((string)file_get_contents($tokenFile)) : '';
if ($expectedToken === '') {
    // Fallback: maybe an admin opted in to forwarding the env via PHP-FPM.
    $expectedToken = getenv('SNAPPYMAIL_BRIDGE_TOKEN') ?: ($_SERVER['SNAPPYMAIL_BRIDGE_TOKEN'] ?? '');
}
if ($expectedToken === '') {
    http_response_code(500);
    echo json_encode(['error' => 'bridge token not configured']);
    exit;
}

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer\s+(.+)$/', $auth, $m) || !hash_equals($expectedToken, trim($m[1]))) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body) || empty($body['email']) || empty($body['password'])) {
    http_response_code(400);
    echo json_encode(['error' => 'email and password required']);
    exit;
}

$email = trim((string)$body['email']);
$password = (string)$body['password'];

// Bootstrap SnappyMail in API-only mode (skips RainLoop\Service::Handle()).
// See snappymail/v/<version>/include.php — last line guards on this env var.
$_ENV['SNAPPYMAIL_INCLUDE_AS_API'] = '1';
$indexPath = __DIR__ . '/index.php';
if (!is_file($indexPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'snappymail index.php not found']);
    exit;
}
require $indexPath;

if (!class_exists('\\RainLoop\\Api')) {
    http_response_code(500);
    echo json_encode(['error' => 'RainLoop\\Api not loadable after bootstrap']);
    exit;
}

try {
    $hash = \RainLoop\Api::CreateUserSsoHash($email, $password);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'CreateUserSsoHash threw: ' . $e->getMessage()]);
    exit;
}

if (!$hash) {
    http_response_code(500);
    echo json_encode(['error' => 'CreateUserSsoHash returned null']);
    exit;
}

echo json_encode([
    'hash' => $hash,
    'redirect_url' => '/?Sso&hash=' . rawurlencode($hash),
]);
