# DAR Accounting Section Tracker — Laravel Conversion

This package is a Laravel/MySQL conversion of the supplied Accounting Section Tracker frontend.
The original UI, voucher fields, roles, reports, audit trail, profile photo handling, CSV/Excel import and export behavior are retained as the starting point.

## Important
This is a **Laravel application overlay/source package**. The Laravel framework and `vendor/` are intentionally not included.
Create a fresh Laravel 12 application, then copy this package's `app`, `bootstrap`, `config`, `database`, `public`, `resources`, and `routes` folders plus `composer.json`, `package.json`, and `package-lock.json` into it.

## Local setup
1. Install PHP 8.2+ and Composer.
2. Create a fresh Laravel 12 app:
   `composer create-project laravel/laravel:^12.0 dar-accounting`
3. Copy this package over the fresh app and replace files when asked.
4. Run `composer install`.
5. Copy `.env.example` to `.env` and set your MySQL credentials.
6. Run `php artisan key:generate`.
7. Run `php artisan migrate --seed`.
8. Start with `php artisan serve`.

## Default account
Username: `superadmin`
Password: `super123`

**Change this password immediately after first login.**

## Hostinger
- PHP: 8.2 or newer
- Database: MySQL
- Document root: Laravel `public` directory
- Set `.env` to the Hostinger MySQL database values.
- Run `composer install --no-dev --optimize-autoloader` if SSH/Composer is available.
- Run `php artisan migrate --force --seed` once.
- Run `php artisan storage:link` if file storage is enabled.
- Point the domain/subdomain to the `public` directory.

## Frontend lockfile
`package-lock.json` is included because the project uses npm metadata even though no frontend build dependency is required. The primary Laravel dependency lockfile is `composer.lock`; generate it by running `composer install` in the fresh Laravel project and commit it to Git.
