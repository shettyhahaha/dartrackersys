<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>DAR Accounting Section Tracker</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" defer></script>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}">
</head>
<body>
<div id="app"></div>
<script>
window.DAR_APP = {
    bootstrapUrl: @json(url('/api/bootstrap')),
    loginUrl: @json(route('login.submit')),
    logoutUrl: @json(route('logout')),
    usersSyncUrl: @json(url('/api/users/sync')),
    vouchersSyncUrl: @json(url('/api/vouchers/sync')),
    auditSyncUrl: @json(url('/api/audit-logs/sync')),
    csrf: @json(csrf_token())
};
</script>
<script src="{{ asset('js/script.js') }}"></script>
</body>
</html>
