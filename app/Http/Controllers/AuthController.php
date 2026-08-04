<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        if (!Auth::attempt(['username' => $credentials['username'], 'password' => $credentials['password']])) {
            AuditLog::create([
                'actor' => $credentials['username'], 'action' => 'Failed Login Attempt',
                'details' => 'Incorrect username or password.', 'logged_at' => now(),
            ]);
            return response()->json(['message' => 'Incorrect username or password.'], 422);
        }

        $request->session()->regenerate();
        $user = Auth::user();
        AuditLog::create([
            'user_id' => $user->id, 'actor' => $user->username, 'role' => $user->role,
            'action' => 'Login', 'details' => $user->name.' ('.$user->role.') signed in.', 'logged_at' => now(),
        ]);
        return response()->json(['ok' => true]);
    }

    public function logout(Request $request)
    {
        $user = Auth::user();
        if ($user) AuditLog::create(['user_id'=>$user->id,'actor'=>$user->username,'role'=>$user->role,'action'=>'Logout','details'=>'User signed out.','logged_at'=>now()]);
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return response()->json(['ok' => true]);
    }
}
