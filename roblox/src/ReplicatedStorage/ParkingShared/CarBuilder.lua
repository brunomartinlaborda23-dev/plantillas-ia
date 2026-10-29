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
	-- La caja de GetBoundingBox sigue la orientación del pivote: se alinea con el mundo para medir.
	local function alignPivot()
		m.PrimaryPart = nil
		m.WorldPivot = CFrame.new(m:GetPivot().Position)
	end
	local function turn(deg)
		m:PivotTo(m:GetPivot() * CFrame.Angles(0, math.rad(deg), 0))
		alignPivot()
	end
	alignPivot()
	local _, size0 = m:GetBoundingBox()
	if size0.X > size0.Z * 1.15 then turn(90) end -- largo a lo largo de Z
	if not CarBuilder.isOwnModel(m) then
		-- Morro hacia -Z (el frente en Roblox): faros delante, pilotos detrás.
		local front = CarBuilder.frontSign(m)
		if front > 0 then turn(180) end
	end
	local fix = (Config.MODEL_FIX and Config.MODEL_FIX[key]) or Config.MODEL_YAW_FIX or 0
	if fix ~= 0 then turn(fix) end
	local _, size = m:GetBoundingBox()
	-- El modelo incluye retrovisores y paragolpes: mide ~3,4 % más que el largo oficial.
	local factor = (spec.l * S * 1.034) / math.max(size.Z, 0.01)
	m:ScaleTo(m:GetScale() * factor)
	local cf2, size2 = m:GetBoundingBox()
	m:TranslateBy(Vector3.new(-cf2.X, -(cf2.Y - size2.Y / 2), -cf2.Z))
	return m
end

-- ---------- Reconocer las piezas de cualquier modelo ----------
local KW = {
	wheel = { "wheel", "tire", "tyre", "rim", "rueda", "llanta", "neum", "whl" },
	notWheel = { "steering", "volante", "spare" },
	glass = { "glass", "window", "vidrio", "cristal", "windshield", "windscreen" },
	paint = { "paint", "body", "carroc", "pintura", "exterior", "chassis", "shell" },
	tail = { "tail", "brake", "stop", "rearlight", "rear_light", "rear light", "piloto" },
	head = { "headlight", "head_light", "headlamp", "faro", "frontlight", "front_light" },
}
local function fullName(p)
	local n = p.Name
	local a = p.Parent
	for _ = 1, 3 do
		if not a or a:IsA("Folder") or a == ReplicatedStorage then break end
		n = n .. " " .. a.Name
		a = a.Parent
	end
	if p:IsA("MeshPart") then
		local sa = p:FindFirstChildOfClass("SurfaceAppearance")
		if sa then n = n .. " " .. sa.Name end
	end
	return string.lower(n)
end
local function hasKW(name, list)
	for _, k in ipairs(list) do
		if string.find(name, k, 1, true) then return true end
	end
	return false
end

-- Caja alineada con el mundo de una pieza (aunque esté girada).
local function aabb(p)
	local cf, hs = p.CFrame, p.Size / 2
	local lo = Vector3.new(math.huge, math.huge, math.huge)
	local hi = -lo
	for _, sx in ipairs({ -1, 1 }) do
		for _, sy in ipairs({ -1, 1 }) do
			for _, sz in ipairs({ -1, 1 }) do
				local c = cf * Vector3.new(sx * hs.X, sy * hs.Y, sz * hs.Z)
				lo = Vector3.new(math.min(lo.X, c.X), math.min(lo.Y, c.Y), math.min(lo.Z, c.Z))
				hi = Vector3.new(math.max(hi.X, c.X), math.max(hi.Y, c.Y), math.max(hi.Z, c.Z))
			end
		end
	end
	return lo, hi
end

-- ¿Es uno de los modelos exportados por el juego (piezas Body, Tire_FL...)?
function CarBuilder.isOwnModel(m)
	for _, p in ipairs(m:GetDescendants()) do
		if p:IsA("BasePart") then
			local n = pieceName(p)
			if n == "Body" or string.match(n, "^Tire_%u%u$") then return true end
		end
	end
	return false
end

-- +1 si los faros están hacia +Z (morro al revés en Roblox), -1 si hacia -Z, 0 si no se sabe.
function CarBuilder.frontSign(m)
	local cf = m:GetBoundingBox()
	local head, tail, nh, nt = 0, 0, 0, 0
	for _, p in ipairs(m:GetDescendants()) do
		if p:IsA("BasePart") then
			local name = fullName(p)
			local z = p.Position.Z - cf.Position.Z
			if hasKW(name, KW.tail) then tail = tail + z nt = nt + 1
			elseif hasKW(name, KW.head) then head = head + z nh = nh + 1 end
		end
	end
	local score = 0
	if nh > 0 then score = score + (head > 0 and 1 or -1) end
	if nt > 0 then score = score - (tail > 0 and 1 or -1) end
	if score > 0 then return 1 elseif score < 0 then return -1 end
	return 0
end

-- Devuelve { [pieza] = { kind = "Body" | "Glass" | "Taillights" | "Tire" | "Rim" | "Wheel" ..., pos = "FL"... } }
local function classify(visual)
	local roles = {}
	local parts = {}
	for _, p in ipairs(visual:GetDescendants()) do
		if p:IsA("BasePart") then table.insert(parts, p) end
	end
	if CarBuilder.isOwnModel(visual) then
		for _, p in ipairs(parts) do
			local name = pieceName(p)
			local k, pos = string.match(name, "^(%a+)_(%u%u)$")
			roles[p] = { kind = k or kind(name), pos = pos, own = true }
		end
		return roles, true
	end
	local cf, size = visual:GetBoundingBox()
	local W, L, H = size.X, size.Z, size.Y
	local byName, byShape = {}, {}
	for _, p in ipairs(parts) do
		local name = fullName(p)
		local lo, hi = aabb(p)
		local ext = hi - lo
		local c = (lo + hi) / 2 - cf.Position
		local corner = math.abs(c.X) > W * 0.2 and math.abs(c.Z) > L * 0.15
		local single = ext.Z < L * 0.45 and ext.X < W * 0.6
		local pos = (c.Z < 0 and "F" or "R") .. (c.X < 0 and "L" or "R")
		if corner and single and hasKW(name, KW.wheel) and not hasKW(name, KW.notWheel) then
			table.insert(byName, { p, pos })
		elseif corner and single and lo.Y < cf.Position.Y - H / 2 + H * 0.12 and ext.Y < H * 0.6
			and math.abs(ext.Y - ext.Z) < 0.35 * math.max(ext.Y, ext.Z) then
			table.insert(byShape, { p, pos })
		end
	end
	for _, e in ipairs(#byName > 0 and byName or byShape) do roles[e[1]] = { kind = "Wheel", pos = e[2] } end
	local paintFound = false
	local largest, largestArea = nil, 0
	for _, p in ipairs(parts) do
		if not roles[p] then
			local name = fullName(p)
			if hasKW(name, KW.glass) or p.Transparency > 0.2 then roles[p] = { kind = "Glass" }
			elseif hasKW(name, KW.tail) then roles[p] = { kind = "Taillights" }
			elseif hasKW(name, KW.paint) then roles[p] = { kind = "Body" } paintFound = true
			else
				local area = p.Size.X * p.Size.Y + p.Size.Y * p.Size.Z + p.Size.X * p.Size.Z
				if area > largestArea then largest, largestArea = p, area end
			end
		end
	end
	-- Sin piezas de pintura con nombre: pinta la pieza más grande y las de su mismo color.
	if not paintFound and largest then
		local c0 = largest.Color
		for _, p in ipairs(parts) do
			local c = p.Color
			if not roles[p] and math.abs(c.R - c0.R) < 0.05 and math.abs(c.G - c0.G) < 0.05 and math.abs(c.B - c0.B) < 0.05 then
				roles[p] = { kind = "Body" }
			end
		end
	end
	return roles, false
end
CarBuilder.classify = classify

local WHEEL_KINDS = { Tire = true, Rim = true, Disc = true, Caliper = true, Wheel = true }

local function style(visual, key, opts, roles, own)
	local paint = opts.color or Color3.fromRGB(214, 40, 40)
	local rim = Config.RIM_COLORS[key] or Color3.fromRGB(190, 195, 200)
	if opts.rims and opts.rims ~= "stock" then rim = CarBuilder.hexToColor(tuningOption("rims", opts.rims).value) end
	local caliper = Config.CALIPER_COLORS[key] or Color3.fromRGB(58, 61, 66)
	for _, p in ipairs(visual:GetDescendants()) do
		if p:IsA("BasePart") then
			local role = roles[p]
			local k = role and role.kind or ""
			local st = own and STYLE[k] or nil
			if k == "Body" then
				p.Color = paint
				if own then
					p.Material = Enum.Material.SmoothPlastic
					p.Reflectance = 0.08
				else
					-- Modelos con texturas: el color se aplica como tinte del material.
					local sa = p:FindFirstChildOfClass("SurfaceAppearance")
					if sa then pcall(function() sa.Color = paint end) end
				end
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
			if own and p:IsA("MeshPart") then p.TextureID = "" end
			p:SetAttribute("Piece", k ~= "" and k or p.Name)
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
	local roles, own = classify(visual)
	style(visual, key, opts, roles, own)
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
		local role = roles[p]
		if drop > 0 and not (role and WHEEL_KINDS[role.kind]) then
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
		local role = roles[p]
		if role and role.pos and WHEEL_KINDS[role.kind] then
			wheelParts[role.pos] = wheelParts[role.pos] or {}
			table.insert(wheelParts[role.pos], { part = p, kind = role.kind })
		end
	end
	for _, pos in ipairs(CarBuilder.WHEELS) do
		local list = wheelParts[pos]
		local center
		if list then
			-- Centro de la rueda: el neumático (modelos del juego) o la caja de todas sus piezas.
			local lo, hi
			for _, e in ipairs(list) do
				if e.kind == "Tire" then center = e.part.Position end
				local a, b = aabb(e.part)
				lo = lo and Vector3.new(math.min(lo.X, a.X), math.min(lo.Y, a.Y), math.min(lo.Z, a.Z)) or a
				hi = hi and Vector3.new(math.max(hi.X, b.X), math.max(hi.Y, b.Y), math.max(hi.Z, b.Z)) or b
			end
			center = center or (lo + hi) / 2
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
				weld.Part0 = (e.kind == "Tire" or e.kind == "Rim" or e.kind == "Wheel") and hub or knuckle
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
