@echo off
echo.
echo =====================================
echo  Allo Inventory - Setup Script
echo =====================================
echo.

echo [1/4] Installing npm dependencies...
npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    pause
    exit /b %errorlevel%
)
echo Done.
echo.

echo [2/4] Generating Prisma client...
npx prisma generate
if %errorlevel% neq 0 (
    echo ERROR: prisma generate failed.
    pause
    exit /b %errorlevel%
)
echo Done.
echo.

echo [3/4] Pushing database schema...
echo NOTE: Make sure your .env file has DATABASE_URL and DIRECT_URL set.
npx prisma db push
if %errorlevel% neq 0 (
    echo ERROR: prisma db push failed. Check your DATABASE_URL in .env
    pause
    exit /b %errorlevel%
)
echo Done.
echo.

echo [4/4] Seeding database...
npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" prisma/seed.ts
if %errorlevel% neq 0 (
    echo ERROR: seed failed.
    pause
    exit /b %errorlevel%
)
echo Done.
echo.

echo =====================================
echo  Setup complete! Run: npm run dev
echo =====================================
pause
