local isOpen = false

local function openUI()
    if isOpen then return end
    isOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({ type = 'show' })
end

local function closeUI()
    if not isOpen then return end
    isOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ type = 'hide' })
end

RegisterCommand('closejobmanager', function()
    isOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ type = 'hide' })
end, false)

RegisterCommand('jobmanager', function()
    if not isOpen then
        TriggerServerEvent('sombra_jobmanager:server:checkAccess')
    else
        closeUI()
    end
end, false)

RegisterNetEvent('sombra_jobmanager:client:open')
AddEventHandler('sombra_jobmanager:client:open', function()
    openUI()
end)

-- Cierra la UI cuando el servidor confirma una accion
RegisterNetEvent('sombra_jobmanager:client:notify')
AddEventHandler('sombra_jobmanager:client:notify', function(success, msg)
    SendNUIMessage({ type = 'notify', success = success, message = msg })
end)

-- Recibe la lista de jobs actualizada
RegisterNetEvent('sombra_jobmanager:client:refreshJobs')
AddEventHandler('sombra_jobmanager:client:refreshJobs', function(jobs)
    SendNUIMessage({ type = 'refreshJobs', jobs = jobs })
end)

-- Callbacks NUI

RegisterNUICallback('close', function(_, cb)
    closeUI()
    cb('ok')
end)

RegisterNUICallback('getJobs', function(_, cb)
    TriggerServerEvent('sombra_jobmanager:server:getJobs')
    cb('ok')
end)

RegisterNUICallback('createJob', function(data, cb)
    TriggerServerEvent('sombra_jobmanager:server:createJob', data)
    cb('ok')
end)

RegisterNUICallback('deleteJob', function(data, cb)
    TriggerServerEvent('sombra_jobmanager:server:deleteJob', data.name)
    cb('ok')
end)

RegisterNUICallback('updateJob', function(data, cb)
    TriggerServerEvent('sombra_jobmanager:server:updateJob', data)
    cb('ok')
end)

RegisterNUICallback('upsertGrade', function(data, cb)
    TriggerServerEvent('sombra_jobmanager:server:upsertGrade', data)
    cb('ok')
end)

RegisterNUICallback('removeGrade', function(data, cb)
    TriggerServerEvent('sombra_jobmanager:server:removeGrade', data.jobName, data.grade)
    cb('ok')
end)
