-- Prueba la física de Roblox (Physics.lua) fuera de Roblox, simulando cómo el motor de Roblox
-- mueve la pieza: conserva la velocidad en el mundo y gira el coche según la velocidad angular.
-- Se ejecuta con: node roblox/tests/run.cjs
local Physics = PHYSICS
local GameData = GAMEDATA
local fails = 0
local function check(ok, msg, extra)
	print((ok and "OK   " or "FAIL ") .. msg .. " " .. (extra or ""))
	if not ok then fails = fails + 1 end
end

-- Coche simulado en 2D: posición (x, z), rumbo a (mira hacia (sin a, cos a)), velocidad en el mundo.
-- hold: si se indica, mantiene esa velocidad constante (como hace la prueba de la web).
local function sim(spec, inp, secs, v0, hold)
	local car = { x = 0, z = 0, a = 0, wx = 0, wz = v0 or 0 }
	local c = { v = 0, vl = 0, steer = 0, gear = 1, yaw = 0, slip = 0 }
	local dt = 1 / 60
	local path = {}
	for _ = 1, math.floor(secs / dt) do
		local lx, lz = math.sin(car.a), math.cos(car.a)
		local leftx, leftz = lz, -lx
		c.v = car.wx * lx + car.wz * lz
		c.vl = car.wx * leftx + car.wz * leftz
		Physics.step(c, inp, spec, dt)
		if hold then c.v = hold end
		car.wx = lx * c.v + leftx * c.vl
		car.wz = lz * c.v + leftz * c.vl
		car.x = car.x + car.wx * dt
		car.z = car.z + car.wz * dt
		car.a = car.a + c.yaw * dt
		path[#path + 1] = { car.x - lx * spec.wb / 2, car.z - lz * spec.wb / 2 }
	end
	return car, c, path
end

local sedan = GameData.CARS.sedan
-- 1. Radio de giro del eje trasero a baja velocidad (para aparcar debe ser wb / tan(maxSteer)).
do
	local _, _, path = sim(sedan, { throttle = 0.15, brake = 0, steer = 1, handbrake = false }, 30, 2, 2)
	local n, cx, cz = 0, 0, 0
	for i = #path - 600, #path do n = n + 1 cx = cx + path[i][1] cz = cz + path[i][2] end
	cx, cz = cx / n, cz / n
	local r = 0
	for i = #path - 600, #path do r = r + math.sqrt((path[i][1] - cx) ^ 2 + (path[i][2] - cz) ^ 2) end
	r = r / n
	local expected = sedan.wb / math.tan(sedan.maxSteer)
	check(math.abs(r - expected) < 0.3, "radio de giro", string.format("%.2f m (esperado %.2f m)", r, expected))
end
-- 2. Girar con steer positivo va hacia la izquierda (+X cuando el coche mira a +Z).
do
	local car = sim(sedan, { throttle = 0.5, brake = 0, steer = 1, handbrake = false }, 1.5, 3)
	check(car.x > 0 and car.a > 0, "steer + gira a la izquierda", string.format("x=%.2f a=%.2f", car.x, car.a))
end
-- 3. Frenada desde 50 km/h
do
	local car, c = sim(sedan, { throttle = 0, brake = 1, steer = 0, handbrake = false }, 4, 13.9)
	check(c.v == 0 and car.z > 8 and car.z < 20, "frenada desde 50 km/h", string.format("%.1f m", car.z))
end
-- 4. Derrape con freno de mano y sin trompo
do
	local _, c = sim(sedan, { throttle = 0.3, brake = 0, steer = 1, handbrake = true }, 0.6, 15)
	check(c.slip > 1, "freno de mano + volante = derrape", string.format("deslizamiento %.2f m/s", c.slip))
	local car = sim(sedan, { throttle = 0.3, brake = 0, steer = 1, handbrake = true }, 1, 15)
	check(math.abs(car.a) < 2.2, "derrape controlable", string.format("giro %.0f°", math.deg(car.a)))
	local _, c2 = sim(sedan, { throttle = 0.3, brake = 0, steer = 1, handbrake = false }, 1.5, 15)
	check(c2.slip < 0.3, "curva normal sin derrape", string.format("%.2f m/s", c2.slip))
end
-- 5. 0-100 km/h del Fulmine HY y velocidad máxima
do
	local hyper = GameData.CARS.hyper
	local c = { v = 0, vl = 0, steer = 0, gear = 1 }
	local t = 0
	while c.v < 27.8 and t < 30 do Physics.step(c, { throttle = 1, brake = 0, steer = 0, handbrake = false }, hyper, 1 / 60) t = t + 1 / 60 end
	check(t > 2 and t < 6, "Fulmine HY 0-100 km/h", string.format("%.1f s", t))
end
-- 6. Caja de cambios: marcha y revoluciones dentro de rango
do
	local d = { gear = 1, rpm = 900 }
	local e = GameData.CARS.cs.engine
	for _ = 1, 120 do Physics.drivetrain(d, e, 20, 1, 1 / 60) end
	check(d.gear >= 2 and d.rpm > e.idle and d.rpm <= e.red, "marchas a 72 km/h", string.format("D%d, %.0f rpm", d.gear, d.rpm))
end
-- 7. Los 10 niveles tienen plaza, salida y obstáculos
do
	local ok = #GameData.LEVELS == 10
	for _, lv in ipairs(GameData.LEVELS) do
		ok = ok and lv.target ~= nil and lv.start ~= nil and #lv.obstacles > 0
	end
	check(ok, "datos de los 10 niveles", "")
	check(#GameData.CITY.coins == 40 and GameData.CITY.target == nil, "datos de la ciudad", #GameData.CITY.obstacles .. " obstáculos")
end
return fails
