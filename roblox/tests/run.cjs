// Ejecuta physics_spec.lua con fengari (Lua en JavaScript). Requiere: npm install fengari
const { lua, lauxlib, lualib, to_luastring } = require('fengari');
const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const run = (code, name) => {
  if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) || lua.lua_pcall(L, 0, 1, 0)) {
    throw new Error(lua.lua_tojsstring(L, -1));
  }
};
run(src('../src/ReplicatedStorage/ParkingShared/Physics.lua'), 'Physics');
lua.lua_setglobal(L, to_luastring('PHYSICS'));
run(src('../src/ReplicatedStorage/ParkingShared/GameData.lua'), 'GameData');
lua.lua_setglobal(L, to_luastring('GAMEDATA'));
run(src('physics_spec.lua'), 'physics_spec');
let fails = lua.lua_tointeger(L, -1);
lua.lua_pop(L, 1);

// CarBuilder con una imitación de la API de Roblox
run(src('mock_roblox.lua'), 'mock_roblox');
lua.lua_pop(L, 1);
run(`package.preload.Config = function() return (function() ${'\n'}${src('../src/ReplicatedStorage/ParkingShared/Config.lua')}${'\n'} end)() end`, 'cfg');
lua.lua_pop(L, 1);
run(`script = { Parent = { Config = 'Config', GameData = 'GameData' } }
local realRequire = require
require = function(m) if m == 'Config' then return realRequire('Config') end if m == 'GameData' then return GAMEDATA end return realRequire(m) end`, 'shim');
lua.lua_pop(L, 1);
run(src('../src/ReplicatedStorage/ParkingShared/CarBuilder.lua'), 'CarBuilder');
lua.lua_setglobal(L, to_luastring('CARBUILDER'));
run(src('classify_spec.lua'), 'classify_spec');
fails += lua.lua_tointeger(L, -1);
console.log(fails ? `${fails} fallos` : 'OK: física y montaje de coches de Roblox verificados');
process.exit(fails ? 1 : 0);
