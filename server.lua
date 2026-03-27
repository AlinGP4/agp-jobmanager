-- ── Framework detection ────────────────────────────────────────

local FW       = nil  -- framework object (QBCore / ESX)
local FW_TYPE  = nil  -- 'qbx' | 'qbcore' | 'esx'

CreateThread(function()
    Wait(500) -- wait for frameworks to start
    if GetResourceState('qbx_core') == 'started' then
        FW_TYPE = 'qbx'
    elseif GetResourceState('qb-core') == 'started' then
        FW_TYPE = 'qbcore'
        FW = exports['qb-core']:GetCoreObject()
    elseif GetResourceState('es_extended') == 'started' then
        FW_TYPE = 'esx'
        FW = exports['es_extended']:getSharedObject()
    else
        print('^1[sombra_jobmanager] ERROR: No se encontró framework compatible (qbx_core / qb-core / es_extended)^7')
    end
    print('^2[sombra_jobmanager] Framework detectado: ' .. (FW_TYPE or 'ninguno') .. '^7')
end)

-- ── Admin check ────────────────────────────────────────────────

local function isAdmin(source)
    if IsPlayerAceAllowed(source, 'group.admin') then return true end
    if FW_TYPE == 'qbcore' and FW then
        return FW.Functions.HasPermission(source, 'admin')
    elseif FW_TYPE == 'esx' and FW then
        local player = FW.GetPlayerFromId(source)
        return player and (player.getGroup() == 'admin' or player.getGroup() == 'superadmin')
    end
    return false
end

-- ── Serializer (QBX / QBCore file format) ─────────────────────

local function escapeStr(str)
    str = tostring(str)
    return str:gsub('([%c%z\\"\'])', {
        ['\\'] = '\\\\', ['"'] = '\\"', ["'"] = "\\'",
        ['\n'] = '\\n',  ['\r'] = '\\r', ['\t'] = '\\t',
    })
end

local function serializeJobsToLua(jobs)
    local lines = {
        '---Job names must be lower case (top level table key)',
        '---@type table<string, Job>',
        'return {'
    }
    for name, job in pairs(jobs) do
        table.insert(lines, ("    ['%s'] = {"):format(name))
        table.insert(lines, ("        label = '%s',"):format(escapeStr(job.label or name)))
        if job.type then
            table.insert(lines, ("        type = '%s',"):format(escapeStr(job.type)))
        end
        table.insert(lines, ("        defaultDuty = %s,"):format(tostring(job.defaultDuty ~= false)))
        table.insert(lines, ("        offDutyPay = %s,"):format(tostring(job.offDutyPay == true)))
        table.insert(lines, "        grades = {")
        for grade, data in pairs(job.grades or {}) do
            local line = ("            [%d] = { name = '%s', payment = %d"):format(
                tonumber(grade), escapeStr(data.name or ''), tonumber(data.payment or 0))
            if data.isboss   then line = line .. ", isboss = true"   end
            if data.bankAuth then line = line .. ", bankAuth = true" end
            line = line .. " },"
            table.insert(lines, line)
        end
        table.insert(lines, "        },")
        table.insert(lines, "    },")
    end
    table.insert(lines, '}')
    return table.concat(lines, '\n')
end

-- ── Framework: Get all jobs (normalized) ──────────────────────

local function fwGetJobs()
    if FW_TYPE == 'qbx' then
        return exports.qbx_core:GetJobs()

    elseif FW_TYPE == 'qbcore' then
        local raw = FW.Shared.Jobs
        local result = {}
        for name, job in pairs(raw) do
            local grades = {}
            for g, data in pairs(job.grades or {}) do
                grades[tonumber(g)] = {
                    name     = data.name,
                    payment  = data.payment or data.salary or 0,
                    isboss   = data.isboss   or false,
                    bankAuth = data.bankAuth or false,
                }
            end
            result[name] = {
                label       = job.label,
                defaultDuty = job.defaultDuty,
                offDutyPay  = job.offDutyPay,
                type        = job.type,
                grades      = grades,
            }
        end
        return result

    elseif FW_TYPE == 'esx' then
        local jobs   = MySQL.query.await('SELECT * FROM jobs')
        local grades = MySQL.query.await('SELECT * FROM job_grades ORDER BY grade ASC')
        local result = {}

        for _, job in ipairs(jobs) do
            result[job.name] = {
                label       = job.label,
                defaultDuty = true,
                offDutyPay  = false,
                grades      = {},
            }
        end
        for _, g in ipairs(grades) do
            if result[g.job_name] then
                result[g.job_name].grades[tonumber(g.grade)] = {
                    name     = g.name,
                    payment  = tonumber(g.salary) or 0,
                    isboss   = g.is_boss == 1 or g.isboss == 1,
                    bankAuth = false,
                }
            end
        end
        return result
    end
    return {}
end

-- ── Framework: Create / update job ────────────────────────────

local function fwCreateJob(name, job)
    if FW_TYPE == 'qbx' then
        return exports.qbx_core:CreateJob(name, job, true)

    elseif FW_TYPE == 'qbcore' then
        FW.Shared.Jobs[name] = {
            label       = job.label,
            defaultDuty = job.defaultDuty,
            offDutyPay  = job.offDutyPay,
            type        = job.type,
            grades      = job.grades,
        }
        TriggerEvent('QBCore:UpdateObject')
        local content = serializeJobsToLua(FW.Shared.Jobs)
        SaveResourceFile('qb-core', 'shared/jobs.lua', content, -1)
        return true, 'ok'

    elseif FW_TYPE == 'esx' then
        local existing = MySQL.scalar.await('SELECT COUNT(*) FROM jobs WHERE name = ?', { name })
        if existing and existing > 0 then
            MySQL.update.await('UPDATE jobs SET label = ? WHERE name = ?', { job.label, name })
        else
            MySQL.insert.await('INSERT INTO jobs (name, label) VALUES (?, ?)', { name, job.label })
            -- Insertar grado inicial en job_grades (requerido por ESX Legacy)
            local initialGrade = job.grades and job.grades[0]
            local gradeName    = initialGrade and initialGrade.name    or 'Empleado'
            local gradeSalary  = initialGrade and initialGrade.payment or 50
            MySQL.insert.await(
                'INSERT INTO job_grades (job_name, grade, name, player_name, salary, skin_male, skin_female) VALUES (?, ?, ?, ?, ?, ?, ?)',
                { name, 0, gradeName, gradeName, gradeSalary, '{}', '{}' }
            )
        end
        return true, 'ok'
    end
    return false, 'no_framework'
end

-- ── Framework: Delete job ──────────────────────────────────────

local function fwRemoveJob(name)
    if FW_TYPE == 'qbx' then
        return exports.qbx_core:RemoveJob(name, true)

    elseif FW_TYPE == 'qbcore' then
        if not FW.Shared.Jobs[name] then return false, 'job_not_exists' end
        FW.Shared.Jobs[name] = nil
        TriggerEvent('QBCore:UpdateObject')
        local content = serializeJobsToLua(FW.Shared.Jobs)
        SaveResourceFile('qb-core', 'shared/jobs.lua', content, -1)
        return true, 'ok'

    elseif FW_TYPE == 'esx' then
        MySQL.update.await('DELETE FROM job_grades WHERE job_name = ?', { name })
        MySQL.update.await('DELETE FROM jobs WHERE name = ?', { name })
        return true, 'ok'
    end
    return false, 'no_framework'
end

-- ── Framework: Update job metadata ────────────────────────────

local function fwUpdateJob(name, data)
    if FW_TYPE == 'qbx' then
        exports.qbx_core:UpsertJobData(name, data, true)
        return true, 'ok'

    elseif FW_TYPE == 'qbcore' then
        if not FW.Shared.Jobs[name] then return false, 'job_not_exists' end
        FW.Shared.Jobs[name].label       = data.label
        FW.Shared.Jobs[name].defaultDuty = data.defaultDuty
        FW.Shared.Jobs[name].offDutyPay  = data.offDutyPay
        FW.Shared.Jobs[name].type        = data.type
        TriggerEvent('QBCore:UpdateObject')
        local content = serializeJobsToLua(FW.Shared.Jobs)
        SaveResourceFile('qb-core', 'shared/jobs.lua', content, -1)
        return true, 'ok'

    elseif FW_TYPE == 'esx' then
        MySQL.update.await('UPDATE jobs SET label = ? WHERE name = ?', { data.label, name })
        return true, 'ok'
    end
    return false, 'no_framework'
end

-- ── Framework: Upsert grade ────────────────────────────────────

local function fwUpsertGrade(jobName, grade, data)
    if FW_TYPE == 'qbx' then
        exports.qbx_core:UpsertJobGrade(jobName, grade, data, true)
        return true, 'ok'

    elseif FW_TYPE == 'qbcore' then
        if not FW.Shared.Jobs[jobName] then return false, 'job_not_exists' end
        FW.Shared.Jobs[jobName].grades[grade] = data
        TriggerEvent('QBCore:UpdateObject')
        local content = serializeJobsToLua(FW.Shared.Jobs)
        SaveResourceFile('qb-core', 'shared/jobs.lua', content, -1)
        return true, 'ok'

    elseif FW_TYPE == 'esx' then
        local existing = MySQL.scalar.await(
            'SELECT COUNT(*) FROM job_grades WHERE job_name = ? AND grade = ?', { jobName, grade })
        if existing and existing > 0 then
            MySQL.update.await(
                'UPDATE job_grades SET name = ?, player_name = ?, salary = ? WHERE job_name = ? AND grade = ?',
                { data.name, data.name, data.payment, jobName, grade })
        else
            MySQL.insert.await(
                'INSERT INTO job_grades (job_name, grade, name, player_name, salary, skin_male, skin_female) VALUES (?, ?, ?, ?, ?, ?, ?)',
                { jobName, grade, data.name, data.name, data.payment, '{}', '{}' })
        end
        return true, 'ok'
    end
    return false, 'no_framework'
end

-- ── Framework: Remove grade ────────────────────────────────────

local function fwRemoveGrade(jobName, grade)
    if FW_TYPE == 'qbx' then
        exports.qbx_core:RemoveJobGrade(jobName, grade, true)
        return true, 'ok'

    elseif FW_TYPE == 'qbcore' then
        if not FW.Shared.Jobs[jobName] then return false, 'job_not_exists' end
        FW.Shared.Jobs[jobName].grades[grade] = nil
        TriggerEvent('QBCore:UpdateObject')
        local content = serializeJobsToLua(FW.Shared.Jobs)
        SaveResourceFile('qb-core', 'shared/jobs.lua', content, -1)
        return true, 'ok'

    elseif FW_TYPE == 'esx' then
        MySQL.update.await(
            'DELETE FROM job_grades WHERE job_name = ? AND grade = ?', { jobName, grade })
        return true, 'ok'
    end
    return false, 'no_framework'
end

-- ── Helpers ────────────────────────────────────────────────────

local function sendJobs(source)
    local jobs = fwGetJobs()
    TriggerClientEvent('sombra_jobmanager:client:refreshJobs', source, jobs)
end

local function notify(source, success, msg)
    TriggerClientEvent('sombra_jobmanager:client:notify', source, success, msg)
end

-- ── Events ─────────────────────────────────────────────────────

RegisterNetEvent('sombra_jobmanager:server:checkAccess')
AddEventHandler('sombra_jobmanager:server:checkAccess', function()
    local src = source
    if not isAdmin(src) then
        notify(src, false, 'Sin permisos de administrador.')
        return
    end
    TriggerClientEvent('sombra_jobmanager:client:open', src)
end)

RegisterNetEvent('sombra_jobmanager:server:getJobs')
AddEventHandler('sombra_jobmanager:server:getJobs', function()
    local src = source
    if not isAdmin(src) then return end
    sendJobs(src)
end)

RegisterNetEvent('sombra_jobmanager:server:createJob')
AddEventHandler('sombra_jobmanager:server:createJob', function(data)
    local src = source
    if not isAdmin(src) then return end

    if type(data.name) ~= 'string' or #data.name == 0 then
        notify(src, false, 'Nombre de job inválido.')
        return
    end

    local name = data.name:lower():gsub('%s+', '_')
    local job = {
        label       = tostring(data.label or name),
        defaultDuty = data.defaultDuty == true,
        offDutyPay  = data.offDutyPay == true,
        type        = (data.jobType ~= '' and data.jobType) or nil,
        grades      = { [0] = { name = 'Empleado', payment = 50 } },
    }

    local success, msg = fwCreateJob(name, job)
    notify(src, success, success and ("Job '%s' creado."):format(name) or msg)
    if success then sendJobs(src) end
end)

RegisterNetEvent('sombra_jobmanager:server:deleteJob')
AddEventHandler('sombra_jobmanager:server:deleteJob', function(jobName)
    local src = source
    if not isAdmin(src) then return end

    if jobName == 'unemployed' then
        notify(src, false, 'No puedes eliminar el job por defecto.')
        return
    end

    local success, msg = fwRemoveJob(jobName)
    notify(src, success, success and ("Job '%s' eliminado."):format(jobName) or msg)
    if success then sendJobs(src) end
end)

RegisterNetEvent('sombra_jobmanager:server:updateJob')
AddEventHandler('sombra_jobmanager:server:updateJob', function(data)
    local src = source
    if not isAdmin(src) then return end

    local jobData = {
        label       = tostring(data.label),
        defaultDuty = data.defaultDuty == true,
        offDutyPay  = data.offDutyPay == true,
        type        = (data.jobType ~= '' and data.jobType) or nil,
    }

    local success, msg = fwUpdateJob(data.name, jobData)
    notify(src, success, success and 'Job actualizado.' or msg)
    if success then sendJobs(src) end
end)

RegisterNetEvent('sombra_jobmanager:server:upsertGrade')
AddEventHandler('sombra_jobmanager:server:upsertGrade', function(data)
    local src = source
    if not isAdmin(src) then return end

    local grade = tonumber(data.grade)
    if not grade then notify(src, false, 'Grado inválido.') return end

    local gradeData = {
        name     = tostring(data.gradeName),
        payment  = tonumber(data.payment) or 0,
        isboss   = data.isboss == true,
        bankAuth = data.bankAuth == true,
    }

    local success, msg = fwUpsertGrade(data.jobName, grade, gradeData)
    notify(src, success, success and 'Grado guardado.' or msg)
    if success then sendJobs(src) end
end)

RegisterNetEvent('sombra_jobmanager:server:removeGrade')
AddEventHandler('sombra_jobmanager:server:removeGrade', function(jobName, grade)
    local src = source
    if not isAdmin(src) then return end

    local g = tonumber(grade)
    if not g then notify(src, false, 'Grado inválido.') return end

    local success, msg = fwRemoveGrade(jobName, g)
    notify(src, success, success and 'Grado eliminado.' or msg)
    if success then sendJobs(src) end
end)
