-- Construye un nivel (o la ciudad) a partir de GameData, con su esquina de referencia en `origin`.
-- Devuelve { folder, obstacles, target (Part o nil), targetHW, targetHL, startCF, coins = { Part } }.
local Shared = script.Parent
local Config = require(Shared.Config)
local CarBuilder = require(Shared.CarBuilder)

local S = Config.SCALE
local LevelBuilder = {}

local function newPart(parent, props)
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do p[k] = v end
	p.Parent = parent
	return p
end

local function folder(name, parent)
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent
	return f
end

-- data: un nivel de GameData.LEVELS o GameData.CITY. city = true para la ciudad.
function LevelBuilder.build(data, origin, parent, city)
	local root = folder(data.name, parent)
	local obstacles = folder("Obstacles", root)
	local decor = folder("Decor", root)
	local b = data.bounds
	local W, L = (b.maxX - b.minX) * S, (b.maxZ - b.minZ) * S
	local center = origin + Vector3.new((b.minX + b.maxX) / 2 * S, 0, (b.minZ + b.maxZ) / 2 * S)

	-- Suelo: césped alrededor y asfalto (u hormigón en la ciudad) dentro del recinto.
	newPart(decor, {
		Name = "Grass", Size = Vector3.new(W + 260, 1, L + 260), CFrame = CFrame.new(center - Vector3.new(0, 0.55, 0)),
		Color = Color3.fromRGB(79, 138, 58), Material = Enum.Material.Grass,
	})
	newPart(decor, {
		Name = "Floor", Size = Vector3.new(W + 4, 1, L + 4), CFrame = CFrame.new(center - Vector3.new(0, 0.5, 0)),
		Color = city and Color3.fromRGB(185, 182, 174) or (data.indoor and Color3.fromRGB(70, 72, 76) or Color3.fromRGB(85, 88, 92)),
		Material = city and Enum.Material.Concrete or Enum.Material.Asphalt,
	})

	if data.roads then
		for _, r in ipairs(data.roads) do
			newPart(decor, {
				Name = "Road", Size = Vector3.new(r.w * S, 0.2, r.l * S), CFrame = CFrame.new(origin + Vector3.new(r.x * S, -0.09, r.z * S)),
				Color = Color3.fromRGB(62, 64, 68), Material = Enum.Material.Asphalt, CanCollide = false,
			})
		end
	end

	for _, ln in ipairs(data.lines) do
		newPart(decor, {
			Name = "Line", Size = Vector3.new(ln.w * S, 0.05, ln.l * S),
			CFrame = CarBuilder.faceCF(origin, ln.x, ln.z, ln.a, 0.03),
			Color = ln.color == "yellow" and Color3.fromRGB(245, 197, 24) or Color3.fromRGB(242, 242, 242),
			Material = Enum.Material.SmoothPlastic, CanCollide = false, CanQuery = false, CanTouch = false,
		})
	end

	for _, o in ipairs(data.obstacles) do
		local t = o.type
		if t == "wall" then
			local h = (o.h or 1.1) * S
			local cf = CarBuilder.faceCF(origin, o.x, o.z, o.a, h / 2)
			newPart(obstacles, { Name = "Wall", Size = Vector3.new(o.hw * 2 * S, h, o.hl * 2 * S), CFrame = cf, Color = Color3.fromRGB(168, 164, 154), Material = Enum.Material.Concrete })
			newPart(decor, { Name = "WallCap", Size = Vector3.new(o.hw * 2 * S + 0.05, 0.3, o.hl * 2 * S + 0.05), CFrame = cf + Vector3.new(0, h / 2, 0), Color = Color3.fromRGB(242, 194, 0), CanCollide = false, CanQuery = false })
		elseif t == "car" then
			local car = CarBuilder.build(o.model, { parked = true, color = CarBuilder.hexToColor(o.color) })
			car:PivotTo(CarBuilder.faceCF(origin, o.x, o.z, o.a, car.PrimaryPart.Position.Y))
			car.Parent = obstacles
		elseif t == "cone" then
			local pos = origin + Vector3.new(o.x * S, 0, o.z * S)
			local up = CFrame.Angles(0, 0, math.rad(90))
			newPart(obstacles, { Name = "Cone", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.72 * S, 0.4 * S, 0.4 * S), CFrame = CFrame.new(pos + Vector3.new(0, 0.36 * S, 0)) * up, Color = Color3.fromRGB(255, 90, 0) })
			newPart(decor, { Name = "ConeBand", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.12 * S, 0.42 * S, 0.42 * S), CFrame = CFrame.new(pos + Vector3.new(0, 0.45 * S, 0)) * up, Color = Color3.new(1, 1, 1), CanCollide = false, CanQuery = false })
		elseif t == "pillar" then
			local pos = origin + Vector3.new(o.x * S, 0, o.z * S)
			newPart(obstacles, { Name = "Pillar", Shape = Enum.PartType.Cylinder, Size = Vector3.new(3.4 * S, o.r * 2 * S, o.r * 2 * S), CFrame = CFrame.new(pos + Vector3.new(0, 1.7 * S, 0)) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(201, 197, 187), Material = Enum.Material.Concrete })
			newPart(decor, { Name = "PillarBand", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.45 * S, o.r * 2 * S + 0.1, o.r * 2 * S + 0.1), CFrame = CFrame.new(pos + Vector3.new(0, 0.25 * S, 0)) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(242, 194, 0), CanCollide = false, CanQuery = false })
		elseif t == "building" then
			local h = o.h * S
			local cf = CarBuilder.faceCF(origin, o.x, o.z, o.a or 0, h / 2)
			newPart(obstacles, { Name = "Building", Size = Vector3.new(o.hw * 2 * S, h, o.hl * 2 * S), CFrame = cf, Color = CarBuilder.hexToColor(o.color), Material = Enum.Material.Concrete })
			-- franjas de ventanas en cada planta
			for floorY = 3 * S, h - 2 * S, 3 * S do
				newPart(decor, { Name = "Windows", Size = Vector3.new(o.hw * 2 * S + 0.2, 1.2 * S, o.hl * 2 * S + 0.2), CFrame = CarBuilder.faceCF(origin, o.x, o.z, o.a or 0, floorY), Color = Color3.fromRGB(59, 74, 92), Material = Enum.Material.Glass, Reflectance = 0.2, CanCollide = false, CanQuery = false })
			end
		end
	end

	local result = { folder = root, obstacles = obstacles, coins = {} }
	local st = data.start
	result.startCF = CarBuilder.faceCF(origin, st.x, st.z, st.a, 0)

	-- Plaza objetivo: superficie amarilla y un cartel flotante.
	if data.target then
		local t = data.target
		local spot = newPart(root, {
			Name = "Target", Size = Vector3.new(t.hw * 2 * S, 0.06, t.hl * 2 * S), CFrame = CarBuilder.faceCF(origin, t.x, t.z, t.a, 0.04),
			Color = Color3.fromRGB(255, 212, 0), Material = Enum.Material.Neon, Transparency = 0.55, CanCollide = false, CanQuery = false, CanTouch = false,
		})
		local gui = Instance.new("BillboardGui")
		gui.Size = UDim2.fromOffset(150, 46)
		gui.StudsOffset = Vector3.new(0, 3 * S, 0)
		gui.AlwaysOnTop = true
		gui.Parent = spot
		local label = Instance.new("TextLabel")
		label.Size = UDim2.fromScale(1, 1)
		label.BackgroundTransparency = 1
		label.Text = "▼ APARCA AQUÍ"
		label.Font = Enum.Font.GothamBlack
		label.TextScaled = true
		label.TextColor3 = Color3.fromRGB(255, 212, 0)
		label.TextStrokeTransparency = 0.3
		label.Parent = gui
		result.target = spot
		result.targetHW = t.hw * S
		result.targetHL = t.hl * S
	end

	-- Monedas (ciudad)
	if data.coins then
		local coins = folder("Coins", root)
		for i, c in ipairs(data.coins) do
			local coin = newPart(coins, {
				Name = "Coin", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.15 * S, 1.1 * S, 1.1 * S),
				CFrame = CFrame.new(origin + Vector3.new(c.x * S, 1 * S, c.z * S)) * CFrame.Angles(0, math.rad(90), 0),
				Color = Color3.fromRGB(255, 200, 61), Material = Enum.Material.Neon, CanCollide = false, CanTouch = false,
			})
			coin:SetAttribute("CoinId", i)
			result.coins[i] = coin
		end
	end

	return result
end

return LevelBuilder
