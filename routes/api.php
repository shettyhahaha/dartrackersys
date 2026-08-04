<?php

use App\Http\Controllers\AccountingDataController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth')->group(function () {
    Route::get('/bootstrap', [AccountingDataController::class, 'bootstrap']);
    Route::post('/users/sync', [AccountingDataController::class, 'syncUsers']);
    Route::post('/vouchers/sync', [AccountingDataController::class, 'syncVouchers']);
    Route::post('/audit-logs/sync', [AccountingDataController::class, 'syncAuditLogs']);
});
