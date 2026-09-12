$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Conectar o Signy local ao Neon' -ForegroundColor Green
Write-Host 'Copie no Neon a connection string completa e cole abaixo.'
Write-Host 'O texto fica oculto porque contém a senha do banco.'
Write-Host ''

$secureValue = Read-Host 'DATABASE_URL' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
try {
    $databaseUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $parsed = $null
    if (-not [Uri]::TryCreate($databaseUrl, [UriKind]::Absolute, [ref]$parsed)) {
        throw 'A conexão informada não é uma URL válida.'
    }
    if ($parsed.Scheme -notin @('postgres', 'postgresql')) {
        throw 'A conexão precisa começar com postgres:// ou postgresql://.'
    }
    if (-not $parsed.Host.EndsWith('.neon.tech')) {
        throw 'O endereço não parece pertencer ao Neon (*.neon.tech).'
    }
    if ([string]::IsNullOrWhiteSpace($parsed.UserInfo) -or -not $parsed.UserInfo.Contains(':')) {
        throw 'A conexão precisa conter o usuário e a senha fornecidos pelo Neon.'
    }
    if (-not $databaseUrl.Contains('sslmode=')) {
        $separator = if ($databaseUrl.Contains('?')) { '&' } else { '?' }
        $databaseUrl += "${separator}sslmode=require"
    }
    $envPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
    [IO.File]::WriteAllText($envPath, "DATABASE_URL=$databaseUrl`n", [Text.UTF8Encoding]::new($false))
    Write-Host ''
    Write-Host 'Conexão salva em .env. Esse arquivo não é enviado ao GitHub.' -ForegroundColor Green
    Write-Host 'A versão local usará o mesmo banco e as mesmas credenciais da produção.'
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $databaseUrl = $null
}
