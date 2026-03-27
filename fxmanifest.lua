fx_version 'cerulean'
game 'gta5'

author 'SombraRP'
description 'Job Manager NUI para administradores'
version '1.0.0'

client_script 'client.lua'

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua',
}

ui_page 'ui/index.html'

files {
    'ui/index.html',
    'ui/css/style.css',
    'ui/js/app.js'
}
