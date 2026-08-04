<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AccountingDataController extends Controller
{
    private function canManageUsers(User $u): bool { return in_array($u->role, ['superadmin','admin'], true); }
    private function canEdit(User $u): bool { return in_array($u->role, ['superadmin','admin','staff'], true); }

    public function bootstrap(Request $request)
    {
        $user = $request->user();
        return response()->json([
            'user' => $this->userArray($user),
            'users' => User::orderBy('id')->get()->map(fn($u) => $this->userArray($u))->values(),
            'vouchers' => Voucher::orderByDesc('date_time')->get()->map(fn($v) => $this->voucherArray($v))->values(),
            'auditLog' => AuditLog::orderByDesc('logged_at')->limit(2000)->get()->map(fn($a) => $this->auditArray($a))->values(),
        ]);
    }

    public function syncUsers(Request $request)
    {
        abort_unless($this->canManageUsers($request->user()), 403);
        $items = $request->validate(['users'=>'array'])['users'];
        DB::transaction(function() use ($items) {
            $keep = [];
            foreach ($items as $item) {
                if (!empty($item['username'])) {
                    $data = [
                        'username' => $item['username'], 'name' => $item['name'] ?? $item['username'],
                        'role' => $item['role'] ?? 'staff', 'avatar' => $item['avatar'] ?? null,
                        'created_by' => $item['createdBy'] ?? null,
                    ];
                    $u = User::updateOrCreate(['username'=>$data['username']], $data);
                    if (!empty($item['password']) && !str_starts_with($item['password'], '$2y$')) $u->password = Hash::make($item['password']);
                    $u->save(); $keep[] = $u->id;
                }
            }
            if ($keep) User::whereNotIn('id',$keep)->delete();
        });
        return response()->json(['ok'=>true]);
    }

    public function syncVouchers(Request $request)
    {
        abort_unless($this->canEdit($request->user()), 403);
        $items = $request->validate(['vouchers'=>'array'])['vouchers'];
        DB::transaction(function() use ($items) {
            $keep=[];
            foreach($items as $item){
                $v = Voucher::updateOrCreate(['external_id'=>$item['id'] ?? null], [
                    'external_id'=>$item['id'] ?? null, 'type'=>$item['type'] ?? 'Incoming',
                    'dv_number'=>$item['dvNumber'] ?? '', 'ors_number'=>$item['orsNumber'] ?? null,
                    'voucher_name'=>$item['voucherName'] ?? '', 'particulars'=>$item['particulars'] ?? null,
                    'amount'=>$item['amount'] ?? 0, 'fund'=>$item['fund'] ?? null, 'status'=>$item['status'] ?? 'Pending',
                    'office'=>$item['office'] ?? null, 'entered_by'=>$item['enteredBy'] ?? null,
                    'date_time'=>$item['dateTime'] ?? now(), 'updated_by'=>$item['updatedBy'] ?? null,
                ]); $keep[]=$v->id;
            }
            if ($keep) Voucher::whereNotIn('id',$keep)->delete(); else Voucher::query()->delete();
        });
        return response()->json(['ok'=>true]);
    }

    public function syncAuditLogs(Request $request)
    {
        $items = $request->validate(['auditLog'=>'array'])['auditLog'];
        $current = $request->user();
        foreach($items as $item){
            $actor = $item['actor'] ?? $current->username;
            if ($actor !== $current->username) continue;
            if (!empty($item['id']) && AuditLog::where('external_id',$item['id'])->exists()) continue;
            AuditLog::create([
                'external_id'=>$item['id'] ?? null, 'actor'=>$current->username, 'role'=>$current->role,
                'action'=>$item['action'] ?? 'Unknown', 'details'=>$item['details'] ?? null,
                'logged_at'=>$item['timestamp'] ?? now(), 'user_id'=>$current->id,
            ]);
        }
        return response()->json(['ok'=>true]);
    }

    private function userArray(User $u): array { return ['id'=>(string)$u->id,'username'=>$u->username,'name'=>$u->name,'role'=>$u->role,'avatar'=>$u->avatar,'createdBy'=>$u->created_by,'createdAt'=>$u->created_at?->toISOString()]; }
    private function voucherArray(Voucher $v): array { return ['id'=>$v->external_id ?: (string)$v->id,'dateTime'=>$v->date_time?->toISOString(),'type'=>$v->type,'dvNumber'=>$v->dv_number,'orsNumber'=>$v->ors_number,'voucherName'=>$v->voucher_name,'particulars'=>$v->particulars,'amount'=>(float)$v->amount,'fund'=>$v->fund,'status'=>$v->status,'office'=>$v->office,'enteredBy'=>$v->entered_by,'updatedAt'=>$v->updated_at?->toISOString(),'updatedBy'=>$v->updated_by]; }
    private function auditArray(AuditLog $a): array { return ['id'=>$a->external_id ?: (string)$a->id,'timestamp'=>$a->logged_at?->toISOString(),'actor'=>$a->actor,'role'=>$a->role,'action'=>$a->action,'details'=>$a->details]; }
}
