<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = ['external_id', 'user_id', 'actor', 'role', 'action', 'details', 'logged_at'];
    protected function casts(): array { return ['logged_at' => 'datetime']; }
}
