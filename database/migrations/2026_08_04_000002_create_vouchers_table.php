<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('vouchers', function (Blueprint $table) {
            $table->id();
            $table->string('external_id')->nullable()->unique();
            $table->string('type', 30);
            $table->string('dv_number')->index();
            $table->string('ors_number')->nullable()->index();
            $table->string('voucher_name');
            $table->text('particulars')->nullable();
            $table->decimal('amount', 15, 2)->default(0);
            $table->string('fund', 50)->nullable();
            $table->string('status', 50)->default('Pending')->index();
            $table->string('office')->nullable()->index();
            $table->string('entered_by')->nullable()->index();
            $table->dateTime('date_time')->nullable()->index();
            $table->string('updated_by')->nullable();
            $table->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('vouchers'); }
};
