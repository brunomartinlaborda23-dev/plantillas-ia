-- Física del coche (misma que la versión web, en metros y m/s).
-- Roblox mueve y gira la pieza; aquí se calcula qué velocidad y giro debe tener en cada momento.
-- Estado c: v (hacia delante), vl (lateral, + = izquierda), steer (ángulo de ruedas), gear (1 o -1).
-- inp: throttle 0..1, brake 0..1, steer -1..1 (+ = izquierda), handbrake bool.
local Physics = {}

local function clamp(x, lo, hi)
	if x < lo then return lo end
	if x > hi then return hi end
	return x
end
Physics.clamp = clamp

local function sign(x)
	if x > 0 then return 1 elseif x < 0 then return -1 end
	return 0
end

function Physics.step(c, inp, s, dt)
	local sp = math.abs(c.v)
	local drifting = inp.handbrake and sp > 4
	local target = clamp(inp.steer, -1, 1) * s.maxSteer
	-- A velocidad, los neumáticos no dan más agarre lateral que `grip`: el coche subvira.
	if sp > 1 then
		local lim = math.atan((s.grip * (drifting and 2.2 or 1) * s.wb) / (sp * sp))
		target = clamp(target, -lim, lim)
	end
	local rate = (s.steerRate / (1 + sp / 14)) * dt
	c.steer = c.steer + clamp(target - c.steer, -rate, rate)

	-- Motor: empuja con fuerza al salir y pierde empuje cerca de la velocidad máxima.
	local v = c.v
	if inp.throttle > 0 then
		local top = c.gear > 0 and s.maxSpeed or s.maxReverse
		local moving = 0
		if sign(v) == c.gear then moving = math.min(1, sp / top) end
		v = v + c.gear * s.accel * inp.throttle * (1 - 0.75 * moving * moving) * dt
	end
	local dec = 0.6 + 0.0035 * v * v
	if inp.brake > 0 then dec = dec + s.brake * inp.brake end
	if inp.handbrake then dec = dec + s.brake * 0.55 end
	local dv = dec * dt
	if math.abs(v) <= dv then v = 0 else v = v - sign(v) * dv end
	c.v = clamp(v, -s.maxReverse, s.maxSpeed)
	c.braking = inp.brake > 0 or inp.handbrake

	-- Giro alrededor del eje trasero: el centro se mueve de lado a (wb/2)·yaw.
	-- Con el freno de mano a velocidad las ruedas traseras se sueltan (derrape).
	local yaw = (c.v / s.wb) * math.tan(c.steer)
	if drifting then yaw = yaw * 1.4 end
	local vlTarget = s.wb / 2 * yaw
	local grip = 60
	if drifting then grip = 1.6 elseif sp > 1 then grip = 30 end
	c.vl = c.vl + (vlTarget - c.vl) * (1 - math.exp(-grip * dt))
	c.slip = math.abs(c.vl - vlTarget)
	c.yaw = yaw
end

-- Marcha y revoluciones (para el sonido y el marcador).
function Physics.drivetrain(d, e, v, throttle, dt)
	local sp = math.abs(v)
	local g = d.gear
	while g < #e.gears and sp > e.gears[g] * 0.9 do g = g + 1 end
	while g > 1 and sp < e.gears[g - 1] * 0.55 do g = g - 1 end
	d.gear = g
	local target = e.idle + (e.red - e.idle) * math.min(1, sp / e.gears[g])
	if sp < 0.5 then target = e.idle + throttle * (e.red - e.idle) * 0.3 end
	d.rpm = d.rpm + (target - d.rpm) * math.min(1, dt * 7)
end

-- ¿Está el rectángulo del coche dentro de la plaza y alineado con ella?
-- carCF: CFrame del coche; spotCF: CFrame de la plaza; tamaños en studs (medio ancho / medio largo).
function Physics.parkedIn(carCF, carHW, carHL, spotCF, spotHW, spotHL)
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			local corner = carCF * Vector3.new(sx * carHW, 0, sz * carHL)
			local lp = spotCF:PointToObjectSpace(corner)
			if math.abs(lp.X) > spotHW or math.abs(lp.Z) > spotHL then return false end
		end
	end
	local d = math.abs(carCF.LookVector:Dot(spotCF.LookVector))
	return d > math.cos(0.22)
end

return Physics
