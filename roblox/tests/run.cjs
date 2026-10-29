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
const fails = lua.lua_tointeger(L, -1);
console.log(fails ? `${fails} fallos` : 'OK: física de Roblox verificada');
process.exit(fails ? 1 : 0);
