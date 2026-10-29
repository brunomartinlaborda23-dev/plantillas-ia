-- Monta un coche a partir de su modelo 3D (ReplicatedStorage.Cars.<clave>, importado desde
-- roblox/models/<clave>.glb). Si el modelo aún no está importado, crea uno sencillo de bloques
-- para que el juego funcione igualmente.
-- Estructura del coche:
--   Model <clave>
--     Chassis   caja invisible con la física (PrimaryPart)
--     Hitbox    un poco mayor que Chassis, para detectar roces en los niveles
--     Seat      asiento del conductor
--     Visual    piezas del modelo (Body, Glass, Tire_FL, Rim_FL...)
--     Knuckle_XX / Hub_XX: ejes invisibles de cada rueda (Motor6D Steer_XX y Spin_XX)
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = script.Parent
local Config = require(Shared.Config)
local GameData = require(Shared.GameData)

local S = Config.SCALE
local CarBuilder = {}
CarBuilder.WHEELS = { "FL", "FR", "RL", "RR" }

-- Aspecto de cada pieza según su nombre.
local STYLE = {
	Glass = { color = Color3.fromRGB(26, 36, 48), material = Enum.Material.Glass, reflectance = 0.25 },
	Trim = { color = Color3.fromRGB(14, 15, 17), material = Enum.Material.SmoothPlastic },
	Carbon = { color = Color3.fromRGB(28, 30, 34), material = Enum.Material.Metal },
	Chrome = { color = Color3.fromRGB(225, 229, 234), material = Enum.Material.Metal, reflectance = 0.4 },
	Headlights = { color = Color3.fromRGB(240, 244, 255), material = Enum.Material.Neon },
	Indicators = { color = Color3.fromRGB(255, 154, 26), material = Enum.Material.Neon },
	Plates = { color = Color3.fromRGB(242, 242, 242), material = Enum.Material.SmoothPlastic },
	Taillights = { color = Color3.fromRGB(120, 0, 0), material = Enum.Material.Neon },
	ReverseLights = { color = Color3.fromRGB(110, 110, 110), material = Enum.Material.SmoothPlastic },
	Tire = { color = Color3.fromRGB(22, 22, 22), material = Enum.Material.SmoothPlastic },
	Disc = { color = Color3.fromRGB(107, 110, 115), material = Enum.Material.Metal },
}

-- El importador de Roblox a veces mete cada malla dentro de un Model con el nombre del nodo.
local function pieceName(part)
	local n = part.Name
	if (n == "MeshPart" or n == "Mesh" or n == "Part") and part.Parent then n = part.Parent.Name end
	return n
end
CarBuilder.pieceName = pieceName

local function kind(name)
	return string.match(name, "^(%a+)") or name
end

function CarBuilder.hexToColor(hex)
	local r, g, b = string.match(hex or "", "#(%x%x)(%x%x)(%x%x)")
	if not r then return Color3.fromRGB(214, 40, 40) end
	return Color3.fromRGB(tonumber(r, 16), tonumber(g, 16), tonumber(b, 16))
end

local function tuningOption(cat, id)
	local opts = GameData.TUNING[cat].options
	for _, o in ipairs(opts) do
		if o.id == id then return o end
	end
	return opts[1]
end
CarBuilder.tuningOption = tuningOption

local function newPart(props)
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do p[k] = v end
	return p
end

-- Coche de bloques (solo si falta el modelo importado).
local function fallbackVisual(spec)
	local m = Instance.new("Model")
	local w, l, h, r = spec.w * S, spec.l * S, spec.h * S, spec.wheelR * S
	local base = r * 0.55
	newPart({ Name = "Body", Size = Vector3.new(w, h * 0.42, l), CFrame = CFrame.new(0, base + h * 0.21, 0), Parent = m })
	newPart({ Name = "Glass", Size = Vector3.new(w * 0.84, h * 0.4, l * 0.5), CFrame = CFrame.new(0, base + h * 0.62, l * 0.04), Parent = m })
	for _, sx in ipairs({ -1, 1 }) do
		newPart({ Name = "Headlights", Size = Vector3.new(w * 0.22, h * 0.07, 0.1), CFrame = CFrame.new(sx * w * 0.3, base + h * 0.33, -l / 2), Parent = m })
		newPart({ Name = "Taillights", Size = Vector3.new(w * 0.24, h * 0.07, 0.1), CFrame = CFrame.new(sx * w * 0.3, base + h * 0.33, l / 2), Parent = m })
	end
	for _, pos in ipairs(CarBuilder.WHEELS) do
		local x = (string.sub(pos, 2, 2) == "L" and -1 or 1) * (w / 2 - 0.4)
		local z = (string.sub(pos, 1, 1) == "F" and -1 or 1) * spec.wb * S / 2
		newPart({ Name = "Tire_" .. pos, Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.7, r * 2, r * 2), CFrame = CFrame.new(x, r, z), Parent = m })
		newPart({ Name = "Rim_" .. pos, Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.75, r * 1.3, r * 1.3), CFrame = CFrame.new(x, r, z), Parent = m })
	end
	return m
end

-- Copia del modelo importado, escalada a las medidas reales del coche y con el suelo en y = 0.
local function templateVisual(key, spec)
	local folder = ReplicatedStorage:FindFirstChild("Cars")
	local t = folder and folder:FindFirstChild(key)
	if not t then return nil end
	local m = t:Clone()
	if m:IsA("BasePart") then
		local wrap = Instance.new("Model")
		m.Parent = wrap
		m = wrap
	end
	for _, p in ipairs(m:GetDescendants()) do
		if p:IsA("BasePart") then p.Anchored = true end
	end
	if Config.MODEL_YAW_FIX and Config.MODEL_YAW_FIX ~= 0 then
		m:PivotTo(m:GetPivot() * CFrame.Angles(0, math.rad(Config.MODEL_YAW_FIX), 0))
	end
	local _, size = m:GetBoundingBox()
	-- El modelo incluye retrovisores y paragolpes: mide ~3,4 % más que el largo oficial.
	local factor = (spec.l * S * 1.034) / math.max(size.Z, 0.01)
	m:ScaleTo(m:GetScale() * factor)
	local cf2, size2 = m:GetBoundingBox()
	m:TranslateBy(Vector3.new(-cf2.X, -(cf2.Y - size2.Y / 2), -cf2.Z))
	return m
end

local function style(visual, key, opts)
	local paint = opts.color or Color3.fromRGB(214, 40, 40)
	local rim = Config.RIM_COLORS[key] or Color3.fromRGB(190, 195, 200)
	if opts.rims and opts.rims ~= "stock" then rim = CarBuilder.hexToColor(tuningOption("rims", opts.rims).value) end
	local caliper = Config.CALIPER_COLORS[key] or Color3.fromRGB(58, 61, 66)
	for _, p in ipairs(visual:GetDescendants()) do
		if p:IsA("BasePart") then
			local name = pieceName(p)
			local k = kind(name)
			local st = STYLE[k]
			if k == "Body" then
				p.Color = paint
				p.Material = Enum.Material.SmoothPlastic
				p.Reflectance = 0.08
			elseif k == "Rim" then
				p.Color = rim
				p.Material = Enum.Material.Metal
				p.Reflectance = 0.2
			elseif k == "Caliper" then
				p.Color = caliper
				p.Material = Enum.Material.SmoothPlastic
			elseif st then
				p.Color = st.color
				p.Material = st.material
				p.Reflectance = st.reflectance or 0
			end
			if p:IsA("MeshPart") then p.TextureID = "" end
			p:SetAttribute("Piece", name)
		end
	end
end

-- opts: color (Color3), rims, height, neon (ids del taller), parked (bool)
function CarBuilder.build(key, opts)
	opts = opts or {}
	local spec = GameData.CARS[key] or GameData.CARS.sedan
	local car = Instance.new("Model")
	car.Name = key
	car:SetAttribute("CarKey", key)

	local visual = templateVisual(key, spec) or fallbackVisual(spec)
	visual.Name = "Visual"
	style(visual, key, opts)
	visual.Parent = car

	local w, l, h = spec.w * S, spec.l * S, spec.h * S
	local chassis = newPart({
		Name = "Chassis", Size = Vector3.new(w * 0.98, h * 0.62, l * 0.98),
		CFrame = CFrame.new(0, h * 0.31, 0), Transparency = 1, CanCollide = true,
		CustomPhysicalProperties = PhysicalProperties.new(0.6, 0.1, 0, 1, 1),
	})
	chassis.Parent = car
	car.PrimaryPart = chassis

	local parts = {}
	for _, p in ipairs(visual:GetDescendants()) do
		if p:IsA("BasePart") then table.insert(parts, p) end
	end

	if opts.parked then
		for _, p in ipairs(parts) do
			p.CanCollide = false
			p.CanQuery = false
			p.CanTouch = false
		end
		return car
	end

	-- Suspensión rebajada: baja la carrocería, no las ruedas.
	local drop = 0
	if opts.height and opts.height ~= "stock" then drop = -(tuningOption("height", opts.height).value or 0) * S end

	for _, p in ipairs(parts) do
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.Massless = true
		local k = kind(pieceName(p))
		if drop > 0 and k ~= "Tire" and k ~= "Rim" and k ~= "Disc" and k ~= "Caliper" then
			p.CFrame = p.CFrame - Vector3.new(0, drop, 0)
		end
	end

	local hitbox = newPart({
		Name = "Hitbox", Size = chassis.Size + Vector3.new(0.3, 0.3, 0.3), CFrame = chassis.CFrame,
		Transparency = 1, CanCollide = false, CanTouch = false, CanQuery = false, Massless = true,
	})
	hitbox.Parent = car

	local seat = Instance.new("Seat")
	seat.Name = "Seat"
	seat.Size = Vector3.new(2, 0.4, 2)
	seat.CFrame = CFrame.new(-w * 0.2, h * 0.18, l * 0.02)
	seat.Transparency = 1
	seat.CanCollide = false
	seat.Massless = true
	seat.Anchored = true
	seat.Parent = car

	-- Ruedas: Knuckle (dirección) -> Hub (giro). Neumático y llanta van en el Hub; disco y pinza en el Knuckle.
	local wheelParts = {}
	for _, p in ipairs(parts) do
		local name = pieceName(p)
		local k, pos = string.match(name, "^(%a+)_(%u%u)$")
		if k and pos then
			wheelParts[pos] = wheelParts[pos] or {}
			table.insert(wheelParts[pos], { part = p, kind = k })
		end
	end
	for _, pos in ipairs(CarBuilder.WHEELS) do
		local list = wheelParts[pos]
		local center
		if list then
			for _, e in ipairs(list) do
				if e.kind == "Tire" then center = e.part.Position end
			end
		end
		if center then
			local knuckle = newPart({ Name = "Knuckle_" .. pos, Size = Vector3.new(0.2, 0.2, 0.2), CFrame = CFrame.new(center), Transparency = 1, CanCollide = false, CanQuery = false, CanTouch = false, Massless = true })
			local hub = newPart({ Name = "Hub_" .. pos, Size = Vector3.new(0.2, 0.2, 0.2), CFrame = CFrame.new(center), Transparency = 1, CanCollide = false, CanQuery = false, CanTouch = false, Massless = true })
			knuckle.Parent = car
			hub.Parent = car
			local steer = Instance.new("Motor6D")
			steer.Name = "Steer_" .. pos
			steer.Part0 = chassis
			steer.Part1 = knuckle
			steer.C0 = chassis.CFrame:ToObjectSpace(CFrame.new(center))
			steer:SetAttribute("BaseC0", steer.C0)
			steer.Parent = chassis
			local spin = Instance.new("Motor6D")
			spin.Name = "Spin_" .. pos
			spin.Part0 = knuckle
			spin.Part1 = hub
			spin.Parent = knuckle
			for _, e in ipairs(list) do
				local weld = Instance.new("WeldConstraint")
				weld.Part0 = (e.kind == "Tire" or e.kind == "Rim") and hub or knuckle
				weld.Part1 = e.part
				weld.Parent = e.part
				e.part:SetAttribute("Wheel", true)
			end
		end
	end

	-- El resto de piezas va soldado al chasis.
	for _, p in ipairs(parts) do
		if not p:GetAttribute("Wheel") then
			local weld = Instance.new("WeldConstraint")
			weld.Part0 = chassis
			weld.Part1 = p
			weld.Parent = p
		end
	end
	for _, p in ipairs({ hitbox, seat }) do
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = chassis
		weld.Part1 = p
		weld.Parent = p
	end

	-- Neón bajo el coche
	if opts.neon and opts.neon ~= "stock" then
		local color = CarBuilder.hexToColor(tuningOption("neon", opts.neon).value)
		local glow = newPart({ Name = "NeonGlow", Size = Vector3.new(w * 0.8, 0.1, l * 0.8), CFrame = CFrame.new(0, 0.15, 0), Color = color, Material = Enum.Material.Neon, Transparency = 0.35, CanCollide = false, CanQuery = false, CanTouch = false, Massless = true })
		local light = Instance.new("PointLight")
		light.Color = color
		light.Range = l * 0.9
		light.Brightness = 3
		light.Parent = glow
		glow.Parent = car
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = chassis
		weld.Part1 = glow
		weld.Parent = glow
	end

	-- Mantiene el coche derecho (no vuelca), libre para girar.
	local att = Instance.new("Attachment")
	att.Name = "Upright"
	att.CFrame = CFrame.fromMatrix(Vector3.new(), Vector3.new(0, 1, 0), Vector3.new(0, 0, 1))
	att.Parent = chassis
	local align = Instance.new("AlignOrientation")
	align.Name = "Upright"
	pcall(function()
		align.Mode = Enum.OrientationAlignmentMode.OneAttachment
		align.AlignType = Enum.AlignType.PrimaryAxisParallel
		align.PrimaryAxis = Vector3.new(0, 1, 0)
	end)
	align.Attachment0 = att
	align.Responsiveness = 60
	align.MaxTorque = 1e8
	align.Parent = chassis

	for _, p in ipairs(car:GetDescendants()) do
		if p:IsA("BasePart") then p.Anchored = false end
	end
	return car
end

-- CFrame que coloca un coche (o cualquier objeto) en (x, z) metros mirando según el ángulo a.
function CarBuilder.faceCF(origin, x, z, a, y)
	return CFrame.new(origin + Vector3.new(x * S, y or 0, z * S)) * CFrame.Angles(0, a + math.pi, 0)
end

return CarBuilder
