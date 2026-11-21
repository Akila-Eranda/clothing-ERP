# Isolated Wave 1 E2E Docker environment

This configuration is separate from the regular `docker-compose.yml`. It defines only PostgreSQL 16 and Redis 7; it does not define or start the API, Web, or Nginx services.

## Host-port diagnosis (historical)

- Generated test-only Redis and browser passwords and stored them outside the repository with ACLs restricted to the current user and Administrators. The existing `redis-acl` file was preserved; the new Redis secret uses `redis-acl-wave1`.
- Compose configuration validation passed. Only the dedicated PostgreSQL and Redis services were started, using the new named volumes and internal network.
- Read-only checks inside those dedicated containers confirmed `hexa_e2e_wave1` / `hexa_e2e` / non-superuser and `migrations=not initialized`; authenticated Redis returned `PONG`.
- **Host access remains blocked:** Docker Desktop records the requested port bindings for 15434 and 16390, but reports no active published ports and neither loopback TCP port accepts connections. The dedicated network remains `internal: true`; do not weaken that isolation to work around the host-port issue.
- **Diagnosis:** The Compose network is configured as `internal: true`. Docker documents this as a network without a connection to host network interfaces ([Compose internal networks](https://docs.docker.com/compose/how-tos/networking/#internal-networks)). The containers have `HostConfig.PortBindings` but empty `NetworkSettings.Ports`; Docker Desktop backend logs show forwarding attempts to `127.0.0.1:0` followed immediately by removal. This is a topology mismatch, not an occupied host port or an unhealthy database/service.
- **Safest fix:** Keep the E2E network internal and use a one-shot runner attached only to that network, connecting to `postgres:5432` and `redis:6379` by service name. This runner and its narrowly scoped guard mode are now implemented below. Do not remove `internal: true`, add a non-internal network, or expose the data services to make host forwarding work.
- At the time of this diagnosis, no migration, seed, or application test was run. The current runner's read-only identity preflight is recorded below.

## Legacy containers (do not use)

The existing containers `hexa-e2e-pg` and `hexa-e2e-redis` remain untouched. Their configuration does not satisfy the Wave 1 guard: PostgreSQL uses database `postgres` and user `hexa_pg_admin`, and Redis authentication was not detected. Do not query, stop, restart, or connect to these legacy containers.

## One-shot internal runner

The Wave 1 Compose project is `hexaone-e2e-wave1`. PostgreSQL and Redis have no host-published ports and connect only to `hexaone_e2e_wave1_network` (`internal: true`). The `e2e-runner` service is in the `verification` profile and is attached only to that same internal network. It obtains credentials from read-only Compose secret mounts and connects by service DNS to `postgres:5432` and `redis:6379`.

The container-only guard mode additionally requires the exact project/network markers, exactly one non-loopback interface, and no default route. It retains the database name/user/non-superuser check, Redis authentication check, and local-only Keycloak/mail/storage checks. Host-runner mode remains restricted to its original loopback endpoints.

The read-only runner preflight passed: database `hexa_e2e_wave1`, role `hexa_e2e`, `superuser=false`, `tables=0`, `migrations=not initialized`, and authenticated Redis `PONG`. No migration, seed, application test, or browser test has been run.

## Fresh-database preflight

The guard checks `to_regclass('public."_prisma_migrations"')` before reading migration counts. On a fresh database it reports `migrations=not initialized`; once the table exists, it reports successful and incomplete counts as before. This changes only informational output: the exact database/user checks, non-superuser requirement, endpoint restrictions, external-secret rejection, and Redis PONG check remain mandatory. The read-only preflight passed against the dedicated database and Redis service.

## Isolation and identity design

- PostgreSQL uses `postgres:16-alpine` and Redis uses `redis:7-alpine`; neither publishes a host port.
- The services use a dedicated internal Docker network and distinct persistent volumes named `hexaone_e2e_wave1_postgres_data` and `hexaone_e2e_wave1_redis_data`; neither references the regular ERP volumes.
- The one-shot `e2e-runner` uses the same internal network only. Its database and Redis endpoints are `postgres:5432` and `redis:6379`; it has no published ports or additional network.
- The official PostgreSQL image bootstrap role is `hexa_e2e_bootstrap`. It is a superuser used only by the first-boot initialization script.
- On a new, empty PostgreSQL volume, `init-postgres.sh` reads the application-role password from the mounted secret, creates `hexa_e2e` with `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, and `NOREPLICATION`, then creates `hexa_e2e_wave1` owned by that restricted role. The app/test runner uses only `hexa_e2e`.
- The initialization script runs only through the PostgreSQL image's empty-data-directory initialization. It is not a migration or seed script. Never point it at an existing or non-empty volume. If first initialization fails, stop and inspect; do not reset or delete the volume.
- Redis ACL should enable only the default test user with a SHA-256 password hash. The runner reads the matching plaintext password from its read-only secret mount and supplies it to the guarded test process, which uses Redis DB 0 with its `hexa-e2e-wave1:` key prefix.
- The E2E runner image installs the API's existing test dependencies and generates the Prisma client at build time. Its default command is the read-only `--preflight`; it does not migrate or seed the database.

## Secret files

Keep every secret file outside the repository. Local Compose file-backed secrets are read-only mounts, not an encrypted secret store; Windows ACLs protect the host files. Configure Compose with file paths only; the runner reads database, Redis, and optional browser passwords from mounted secret files and does not receive them in Compose environment variables. Do not use PowerShell transcription or command logging for this session.

The fresh-install commands below do not generate passwords. They prompt without echoing input and write protected secret files without outputting values. They are only for a genuinely new, empty secret directory; do not rerun them against the existing populated directory.

### Create and secure the external directory

Use this dedicated directory only for these E2E files. If it already contains any entries, stop and inspect it manually rather than changing ACLs or overwriting files. The check below reports no entry names or contents.

```powershell
$secretDir = Join-Path $env:LOCALAPPDATA 'HexaOne\e2e-wave1-secrets'
New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
if (@(Get-ChildItem -LiteralPath $secretDir -Force).Count -ne 0) {
    throw 'The dedicated secret directory is not empty; stop and inspect it without opening secret files.'
}

$userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$administratorsSid = 'S-1-5-32-544'
& icacls.exe $secretDir /inheritance:r /grant:r "*$($userSid):(OI)(CI)F" "*$($administratorsSid):(OI)(CI)F"
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the secret-directory ACL.' }
```

This removes inherited access and grants Full Control only to the current user and the built-in Administrators group. Use an account with authority to set these ACLs. Docker Desktop must be able to read the directory as the current user.

### Prompt for passwords and write protected files

There are three independent service passwords: PostgreSQL bootstrap, PostgreSQL application role, and Redis. Do not reuse passwords. These commands refuse to overwrite any expected file.

```powershell
function ConvertTo-TemporaryPlainText {
    param([Parameter(Mandatory = $true)][Security.SecureString]$Secret)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    try {
        [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Write-ProtectedSecret {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][Security.SecureString]$Secret,
        [string]$ProcessVariable
    )
    $path = Join-Path $secretDir $Name
    if (Test-Path -LiteralPath $path) {
        throw "Secret file already exists; refusing to overwrite: $Name"
    }
    $plain = ConvertTo-TemporaryPlainText $Secret
    try {
        [IO.File]::WriteAllText($path, $plain + "`n", [Text.UTF8Encoding]::new($false))
        if ($ProcessVariable) {
            [Environment]::SetEnvironmentVariable($ProcessVariable, $plain, 'Process')
        }
    }
    finally {
        $plain = $null
    }
    & icacls.exe $path /inheritance:r /grant:r "*$($userSid):F" "*$($administratorsSid):F" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not restrict the ACL for: $Name" }
}

function Write-RedisSecrets {
    param([Parameter(Mandatory = $true)][Security.SecureString]$Secret)
    $passwordPath = Join-Path $secretDir 'e2e-redis-password'
    $aclPath = Join-Path $secretDir 'redis-acl'
    if ((Test-Path -LiteralPath $passwordPath) -or (Test-Path -LiteralPath $aclPath)) {
        throw 'A Redis secret file already exists; refusing to overwrite either file.'
    }
    $plain = ConvertTo-TemporaryPlainText $Secret
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        [IO.File]::WriteAllText($passwordPath, $plain + "`n", [Text.UTF8Encoding]::new($false))
        [Environment]::SetEnvironmentVariable('E2E_REDIS_PASSWORD', $plain, 'Process')
        $bytes = [Text.Encoding]::UTF8.GetBytes($plain)
        try {
            $hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
        }
        finally {
            [Array]::Clear($bytes, 0, $bytes.Length)
        }
        $aclLine = "user default on #$hash ~* &* +@all`n"
        [IO.File]::WriteAllText($aclPath, $aclLine, [Text.UTF8Encoding]::new($false))
    }
    finally {
        $sha.Dispose()
        $plain = $null
    }
    foreach ($path in @($passwordPath, $aclPath)) {
        & icacls.exe $path /inheritance:r /grant:r "*$($userSid):F" "*$($administratorsSid):F" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not restrict a Redis secret-file ACL.' }
    }
}

$bootstrapPassword = Read-Host -Prompt 'Enter a new PostgreSQL bootstrap password' -AsSecureString
$databasePassword = Read-Host -Prompt 'Enter a new hexa_e2e database-role password' -AsSecureString
$redisPassword = Read-Host -Prompt 'Enter a new Redis password' -AsSecureString

Write-ProtectedSecret 'postgres-bootstrap-password' $bootstrapPassword
Write-ProtectedSecret 'e2e-database-password' $databasePassword 'E2E_DATABASE_PASSWORD'
Write-RedisSecrets $redisPassword

$bootstrapPassword.Dispose()
$databasePassword.Dispose()
$redisPassword.Dispose()
```

The Redis ACL file contains the SHA-256 hash of the exact UTF-8 Redis password, not the plaintext password. The `e2e-redis-password` and `e2e-browser-password` files are protected copies for local use; the runner values are set directly from the secure prompts in the current process. The application-role password is similarly written to its Compose file and set as `E2E_DATABASE_PASSWORD` for the runner. Plaintext exists briefly in process memory because PostgreSQL, Redis authentication, and the runner need it; it is not embedded in commands or printed.

Only when synthetic-account seeding is separately approved, run this optional step in the same PowerShell window:

```powershell
$browserPassword = Read-Host -Prompt 'Enter the synthetic browser-account password' -AsSecureString
Write-ProtectedSecret 'e2e-browser-password' $browserPassword 'E2E_BROWSER_PASSWORD'
$browserPassword.Dispose()
```

### Set Compose file paths and browser fixture identifier

Set these in the same PowerShell window that will run Compose:

```powershell
$env:E2E_PG_BOOTSTRAP_PASSWORD_FILE = Join-Path $secretDir 'postgres-bootstrap-password'
$env:E2E_DATABASE_PASSWORD_FILE = Join-Path $secretDir 'e2e-database-password'
$env:E2E_REDIS_ACL_FILE = Join-Path $secretDir 'redis-acl'
```

For approved browser-account seeding, set a unique non-secret subdomain matching the runner's required pattern:

```powershell
$browserSubdomain = Read-Host -Prompt 'Enter a unique synthetic E2E browser subdomain'
if ($browserSubdomain -notmatch '\Awave1-browser-[a-z0-9-]{4,48}\z') {
    throw 'The browser subdomain does not match wave1-browser-[a-z0-9-]{4,48}.'
}
$env:E2E_BROWSER_SUBDOMAIN = $browserSubdomain
$browserSubdomain = $null
```

### Verify without revealing values

These checks print only file paths and present/missing, restricted/review-required, and set/unset statuses. Do not use `Get-Content`, `type`, `more`, `Format-List Env:`, or commands that dump the process environment.

```powershell
$expectedFiles = @(
    'postgres-bootstrap-password',
    'e2e-database-password',
    'redis-acl',
    'e2e-redis-password',
    'e2e-browser-password',
    'redis-acl-wave1'
)
foreach ($name in $expectedFiles) {
    $path = Join-Path $secretDir $name
    '{0}: {1}' -f $name, $(if (Test-Path -LiteralPath $path -PathType Leaf) { 'present' } else { 'missing' })
}

foreach ($name in @(
    'E2E_PG_BOOTSTRAP_PASSWORD_FILE',
    'E2E_DATABASE_PASSWORD_FILE',
    'E2E_REDIS_ACL_FILE',
    'E2E_REDIS_PASSWORD_FILE',
    'E2E_BROWSER_PASSWORD_FILE',
    'E2E_BROWSER_SUBDOMAIN'
)) {
    '{0}: {1}' -f $name, $(if ([Environment]::GetEnvironmentVariable($name, 'Process')) { 'set' } else { 'missing' })
}

$allowedSids = @($userSid, $administratorsSid)
foreach ($path in @($secretDir) + @($expectedFiles | ForEach-Object { Join-Path $secretDir $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })) {
    $acl = Get-Acl -LiteralPath $path
    $rules = @($acl.Access)
    $unexpected = @($acl.Access | Where-Object {
        $sid = $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        $allowedSids -notcontains $sid
    })
    $fullControlSids = @($rules | Where-Object {
        $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        (($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl)
    } | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value })
    $missingPrincipals = @($allowedSids | Where-Object { $fullControlSids -notcontains $_ })
    $hasInheritedRules = @($rules | Where-Object { $_.IsInherited }).Count -ne 0
    $restricted = $acl.AreAccessRulesProtected -and -not $hasInheritedRules -and
        $unexpected.Count -eq 0 -and $missingPrincipals.Count -eq 0
    '{0}: {1}' -f $path, $(if ($restricted) { 'restricted' } else { 'review-required' })
    if (-not $restricted) { throw 'The ACL is not limited to the current user and Administrators; stop and review it.' }
}
```

If a file or variable required for the operation you intend to run is missing, or an ACL reports `review-required`, stop and resolve that locally first. `e2e-browser-password`, `E2E_BROWSER_PASSWORD`, and `E2E_BROWSER_SUBDOMAIN` are required only for separately approved browser-account seeding. Do not paste passwords, file contents, or environment dumps into chat, tickets, or logs. Process variables disappear when this PowerShell process exits.

Required files:

| File | Contents | Used by |
|---|---|---|
| `postgres-bootstrap-password` | Unique one-line bootstrap password | PostgreSQL image, first initialization only |
| `e2e-database-password` | Unique one-line password for `hexa_e2e` | PostgreSQL initialization; read-only secret mount in the E2E runner |
| `redis-acl` | `user default on #<sha256-hex> ~* &* +@all` using the hash of the E2E Redis password | Redis server |
| `e2e-redis-password` | Plaintext E2E Redis password | Read-only runner secret mount; must match the ACL hash |
| `e2e-browser-password` | Synthetic browser-account password | Browser-account seed process only |
| `redis-acl-wave1` | ACL generated for the current Wave 1 Redis password; existing `redis-acl` is preserved | Current Wave 1 Redis service |

Set these **path-only** variables in the PowerShell process used for Compose:

- `E2E_PG_BOOTSTRAP_PASSWORD_FILE`
- `E2E_DATABASE_PASSWORD_FILE`
- `E2E_REDIS_ACL_FILE`
- `E2E_REDIS_PASSWORD_FILE`
- `E2E_BROWSER_PASSWORD_FILE`

The internal one-shot runner receives secrets as read-only files at `/run/secrets`; do not set secret values in Compose environment variables. Browser-account seeding additionally requires a unique `E2E_BROWSER_SUBDOMAIN` matching `wave1-browser-[a-z0-9-]{4,48}`.

## Configure and validate without displaying secrets

Set these paths in the same PowerShell process used for all Compose commands. For the current setup, keep the existing `redis-acl` file untouched and point Wave 1 at `redis-acl-wave1`.

```powershell
$secretDir = Join-Path $env:LOCALAPPDATA 'HexaOne\e2e-wave1-secrets'
$env:E2E_PG_BOOTSTRAP_PASSWORD_FILE = Join-Path $secretDir 'postgres-bootstrap-password'
$env:E2E_DATABASE_PASSWORD_FILE = Join-Path $secretDir 'e2e-database-password'
$env:E2E_REDIS_ACL_FILE = Join-Path $secretDir 'redis-acl-wave1'
$env:E2E_REDIS_PASSWORD_FILE = Join-Path $secretDir 'e2e-redis-password'
$env:E2E_BROWSER_PASSWORD_FILE = Join-Path $secretDir 'e2e-browser-password'

$composeFile = '.\docker-compose.e2e.yml'
$project = 'hexaone-e2e-wave1'
docker compose --project-name $project --file $composeFile --profile verification config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration validation failed.' }

$config = (docker compose --project-name $project --file $composeFile --profile verification config --format json | Out-String) | ConvertFrom-Json
if ($config.name -ne $project -or $config.networks.e2e.internal -ne $true) {
    throw 'Unexpected E2E project or non-internal network.'
}
foreach ($serviceName in @('postgres', 'redis', 'e2e-runner')) {
    $service = $config.services.PSObject.Properties[$serviceName].Value
    $networks = @($service.networks.PSObject.Properties.Name)
    if ($service.ports -or $networks.Count -ne 1 -or $networks[0] -ne 'e2e') {
        throw "Unexpected port publishing or network attachment: $serviceName"
    }
}
```

## Build and start the dedicated services

```powershell
docker compose --project-name $project --file $composeFile --profile verification build e2e-runner
if ($LASTEXITCODE -ne 0) { throw 'E2E runner image build failed.' }

docker compose --project-name $project --file $composeFile up -d --no-deps postgres redis
if ($LASTEXITCODE -ne 0) { throw 'Starting the dedicated E2E services failed.' }
docker compose --project-name $project --file $composeFile ps
```

The `up` command is scoped to the two named services and reuses their dedicated volumes. It may recreate only these Wave 1 containers to apply the no-host-ports configuration. Confirm the project, container names, volume names, and network before running it. Do not use the regular Compose file, `down -v`, volume removal, or commands that stop/recreate legacy containers.

## Read-only runner connectivity preflight

Run this only after PostgreSQL reports healthy and both data services are in the dedicated project. `--no-deps` prevents Compose from starting or recreating them as a side effect. This preflight verifies service DNS connectivity, exact database/user/non-superuser identity, and authenticated Redis `PONG`; it only reads metadata and does not migrate, seed, or run application tests.

```powershell
docker compose --project-name $project --file $composeFile --profile verification run --rm --no-deps e2e-runner --preflight
if ($LASTEXITCODE -ne 0) { throw 'Read-only E2E connectivity preflight failed.' }
```

Only after the preflight passes and a migration/seed is separately approved may E2E specs be run. For example, a future explicitly approved spec run uses `docker compose --project-name $project --file $composeFile --profile verification run --rm --no-deps e2e-runner <spec-name>.e2e-spec.ts`; the runner's Jest global setup repeats the read-only guard before the spec.

## Loopback-only browser API relay

The host browser cannot rely on Docker Desktop publishing a port from the internal E2E network. For approved browser verification, start the API as a one-off runner attached only to the existing internal network. Do not add `-p`, `--service-ports`, another network, or host networking:

```powershell
docker compose --project-name $project --file $composeFile --profile verification run --detach --no-deps e2e-runner --api
```

After its read-only preflight passes, start `node .\scripts\e2e-wave1-browser-relay.cjs` from the repository root. The relay binds only to `127.0.0.1:3101`, selects exactly one running Compose runner for project `hexaone-e2e-wave1`, and checks its image, runner markers, sole network attachment, and the internal `hexaone_e2e_wave1_network` on startup and before forwarded requests. It uses Docker Exec to send HTTP requests only to `127.0.0.1:3101` inside that runner. It does not expose a general command, destination, or container selector to browser requests, and does not forward WebSockets.

Set `NEXT_PUBLIC_API_URL=http://127.0.0.1:3101/api/v1` in the frontend process before starting the existing web development server. The relay accepts browser CORS only from `http://localhost:3000`, limits requests to `/api/v1` and the supported HTTP methods, caps request bodies at 1 MiB, and uses bounded request timeouts. It does not log request bodies, authorization values, passwords, or tokens.

Stopping the relay with Ctrl+C closes only its loopback HTTP listener; it does not stop or change the API runner, PostgreSQL, Redis, their volumes, or the internal network. PostgreSQL and Redis must continue to show no published host ports.
