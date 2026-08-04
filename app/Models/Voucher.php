<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Voucher extends Model
{
    protected $fillable = [
        'external_id', 'type', 'dv_number', 'ors_number', 'voucher_name',
        'particulars', 'amount', 'fund', 'status', 'office', 'entered_by',
        'date_time', 'updated_by',
    ];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'date_time' => 'datetime'];
    }
}
