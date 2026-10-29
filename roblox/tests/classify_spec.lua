-- Prueba la detección de piezas de CarBuilder con modelos simulados.
local CarBuilder = CARBUILDER
local fails = 0
local function check(ok, msg, extra)
	print((ok and "OK   " or "FAIL ") .. msg .. " " .. (extra or ""))
	if not ok then fails = fails + 1 end
end
local red, grey = { R = 0.8, G = 0.1, B = 0.1 }, { R = 0.3, G = 0.3, B = 0.3 }

-- Modelo "de internet": nombres sin sentido. Morro hacia -Z (Roblox), ancho 6, largo 14, alto 4.
local wheels = {}
local generic = {
	{ name = "Object_1", size = { 6, 2, 14 }, pos = { 0, 1.6, 0 }, color = red },          -- carrocería
	{ name = "Object_2", size = { 5, 1.4, 6 }, pos = { 0, 3.3, 0.5 }, color = red },        -- techo (mismo color)
	{ name = "Object_3", size = { 4.6, 1.2, 5 }, pos = { 0, 3.2, 0.4 }, color = grey, transparency = 0.5 }, -- cristal
	{ name = "Object_4", size = { 1.2, 0.4, 0.2 }, pos = { -2, 2, -7 }, color = grey },     -- faro
}
for i, w in ipairs({ { -2.6, -4.5, "FL" }, { 2.6, -4.5, "FR" }, { -2.6, 4.5, "RL" }, { 2.6, 4.5, "RR" } }) do
	table.insert(generic, { name = "Object_" .. (10 + i), size = { 0.9, 2.2, 2.2 }, pos = { w[1], 1.1, w[2] }, color = grey })
	wheels["Object_" .. (10 + i)] = w[3]
end
local m = MOCK_MODEL(generic)
local roles, own = CarBuilder.classify(m)
check(own == false, "modelo genérico reconocido como externo")
local okWheels, body = 0, 0
for p, r in pairs(roles) do
	if r.kind == "Wheel" and wheels[p.Name] == r.pos then okWheels = okWheels + 1 end
	if r.kind == "Body" then body = body + 1 end
end
check(okWheels == 4, "4 ruedas detectadas por su forma y en su esquina", okWheels .. "/4")
check(body == 2, "pintura: pieza más grande y las de su color", body .. " piezas")
local glassOk = false
for p, r in pairs(roles) do if p.Name == "Object_3" and r.kind == "Glass" then glassOk = true end end
check(glassOk, "cristal detectado por transparencia")

-- Ruedas con nombre ("wheel") aunque la forma no sea redonda
local named = MOCK_MODEL({
	{ name = "CarBody", size = { 6, 2, 14 }, pos = { 0, 1.6, 0 } },
	{ name = "Wheel_front_left", size = { 1.2, 2.2, 1.0 }, pos = { -2.6, 1.1, -4.5 } },
	{ name = "Wheel_rear_right", size = { 1.2, 2.2, 1.0 }, pos = { 2.6, 1.1, 4.5 } },
})
roles = CarBuilder.classify(named)
local got = {}
for p, r in pairs(roles) do got[p.Name] = r.kind .. (r.pos and (":" .. r.pos) or "") end
check(got.Wheel_front_left == "Wheel:FL" and got.Wheel_rear_right == "Wheel:RR", "ruedas por nombre", got.Wheel_front_left .. " " .. got.Wheel_rear_right)
check(got.CarBody == "Body", "pintura por nombre (body)")

-- Morro: faro hacia +Z → hay que girarlo
local backwards = MOCK_MODEL({
	{ name = "Body", size = { 6, 2, 14 }, pos = { 0, 1.6, 0 } },
	{ name = "HeadLight_L", size = { 1, 0.4, 0.2 }, pos = { -2, 2, 7 } },
	{ name = "TailLight_L", size = { 1, 0.4, 0.2 }, pos = { -2, 2, -7 } },
})
check(CarBuilder.frontSign(backwards) == 1, "morro al revés detectado por faros y pilotos")

-- Modelos exportados por el juego (Body, Tire_FL...)
local mine = MOCK_MODEL({
	{ name = "Body", size = { 6, 2, 14 }, pos = { 0, 1.6, 0 } },
	{ name = "Tire_FL", size = { 0.8, 2, 2 }, pos = { -2.6, 1, -4.5 } },
	{ name = "Rim_FL", size = { 0.8, 1.3, 1.3 }, pos = { -2.6, 1, -4.5 } },
})
roles, own = CarBuilder.classify(mine)
local tire
for p, r in pairs(roles) do if p.Name == "Tire_FL" then tire = r end end
check(own and tire.kind == "Tire" and tire.pos == "FL", "modelos del juego por nombre de pieza")
return fails
