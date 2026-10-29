-- Servidor de Parking Pro 3D: partidas guardadas, compras, recompensas validadas,
-- niveles privados de cada jugador, ciudad compartida con monedas y panel de admin.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local Lighting = game:GetService("Lighting")

local Shared = ReplicatedStorage:WaitForChild("ParkingShared")
local Config = require(Shared.Config)
local GameData = require(Shared.GameData)
local CarBuilder = require(Shared.CarBuilder)
local LevelBuilder = require(Shared.LevelBuilder)
local Physics = require(Shared.Physics)

local S = Config.SCALE

-- ---------- Comunicación con los jugadores ----------
local remotes = Instance.new("Folder")
remotes.Name = "ParkingRemotes"
local request = Instance.new("RemoteFunction")
request.Name = "Request"
request.Parent = remotes
local profileChanged = Instance.new("RemoteEvent")
profileChanged.Name = "ProfileChanged"
profileChanged.Parent = remotes
local coinTaken = Instance.new("RemoteEvent")
coinTaken.Name = "CoinTaken"
coinTaken.Parent = remotes
remotes.Parent = ReplicatedStorage

if not ReplicatedStorage:FindFirstChild("Cars") then
	local cars = Instance.new("Folder")
	cars.Name = "Cars"
	cars.Parent = ReplicatedStorage
end

-- ---------- Ambiente ----------
Lighting.ClockTime = 14
Lighting.Brightness = 2.5
Lighting.OutdoorAmbient = Color3.fromRGB(150, 155, 165)
Lighting.GlobalShadows = true

-- ---------- Ciudad compartida ----------
local carsFolder = Instance.new("Folder")
carsFolder.Name = "PlayerCars"
carsFolder.Parent = workspace
local levelsFolder = Instance.new("Folder")
levelsFolder.Name = "PlayerLevels"
levelsFolder.Parent = workspace

local city = LevelBuilder.build(GameData.CITY, Vector3.new(), workspace, true)
city.folder.Name = "City"
local spawn = Instance.new("SpawnLocation")
spawn.Name = "CitySpawn"
spawn.Anchored = true
spawn.Size = Vector3.new(8, 1, 8)
spawn.CFrame = CFrame.new(8 * S, -0.4, 8 * S)
spawn.Transparency = 0.5
spawn.Color = Color3.fromRGB(255, 180, 0)
spawn.Neutral = true
spawn.Parent = city.folder

-- ---------- Partidas guardadas ----------
local store = DataStoreService:GetDataStore(Config.DATASTORE_NAME)
local profiles = {}
local states = {}

local function defaultProfile()
	return {
		coins = Config.START_COINS, owned = { "sedan" }, car = "sedan", color = "#d62828",
		stars = {}, tuning = {}, parts = {}, god = false,
	}
end

local function contains(list, value)
	for _, v in ipairs(list) do
		if v == value then return true end
	end
	return false
end

local function isAdmin(player)
	if game.CreatorType == Enum.CreatorType.User and player.UserId == game.CreatorId then return true end
	if game:GetService("RunService"):IsStudio() then return true end
	return contains(Config.ADMIN_USER_IDS, player.UserId)
end

local function publicProfile(player)
	local p = profiles[player]
	if not p then return nil end
	return {
		coins = p.coins, owned = p.owned, car = p.car, color = p.color, stars = p.stars,
		tuning = p.tuning, parts = p.parts, god = p.god, admin = isAdmin(player),
	}
end

local function changed(player)
	local p = profiles[player]
	if not p then return end
	local ls = player:FindFirstChild("leaderstats")
	if ls and ls:FindFirstChild("Monedas") then ls.Monedas.Value = p.coins end
	profileChanged:FireClient(player, publicProfile(player))
end

local function save(player)
	local p = profiles[player]
	if not p then return end
	local ok, err = pcall(function()
		store:SetAsync("u_" .. player.UserId, p)
	end)
	if not ok then warn("No se pudo guardar la partida de " .. player.Name .. ": " .. tostring(err)) end
end

local function load(player)
	local data
	local ok, err = pcall(function()
		data = store:GetAsync("u_" .. player.UserId)
	end)
	if not ok then warn("No se pudo cargar la partida (¿API Services desactivado en Studio?): " .. tostring(err)) end
	local p = defaultProfile()
	if type(data) == "table" then
		for k, v in pairs(data) do p[k] = v end
	end
	return p
end

-- ---------- Coches ----------
local slots = {}

local function setCharacterVisible(character, visible)
	if not character then return end
	for _, d in ipairs(character:GetDescendants()) do
		if d:IsA("BasePart") and d.Name ~= "HumanoidRootPart" then
			if visible then
				d.Transparency = d:GetAttribute("OriginalTransparency") or d.Transparency
			else
				if d:GetAttribute("OriginalTransparency") == nil then d:SetAttribute("OriginalTransparency", d.Transparency) end
				d.Transparency = 1
			end
		elseif d:IsA("Decal") then
			d.Transparency = visible and 0 or 1
		end
	end
end

local function despawn(player)
	local st = states[player]
	if not st then return end
	if st.car then st.car:Destroy() end
	if st.level then st.level.folder:Destroy() end
	if st.slot then slots[st.slot] = nil end
	states[player] = nil
	local character = player.Character
	if character then
		setCharacterVisible(character, true)
		local hum = character:FindFirstChildOfClass("Humanoid")
		if hum then hum.Sit = false end
		task.defer(function()
			if character.Parent then character:PivotTo(spawn.CFrame + Vector3.new(0, 4, 0)) end
		end)
	end
end

local function spawnCar(player, cf)
	local p = profiles[player]
	local key = p.car
	local tune = p.tuning[key] or {}
	local car = CarBuilder.build(key, {
		color = CarBuilder.hexToColor(p.color), rims = tune.rims, height = tune.height, neon = tune.neon,
	})
	car.Name = player.Name .. "_" .. key
	car:SetAttribute("Owner", player.UserId)
	local lift = car.PrimaryPart.Position.Y + 0.3
	car:PivotTo(cf + Vector3.new(0, lift, 0))
	car.Parent = carsFolder
	car.PrimaryPart:SetNetworkOwner(player)
	local character = player.Character
	local hum = character and character:FindFirstChildOfClass("Humanoid")
	if hum then
		car.Seat:Sit(hum)
		setCharacterVisible(character, false)
	end
	return car
end

local function freeSlot()
	local i = 1
	while slots[i] do i = i + 1 end
	return i
end

local function starsOf(p, i)
	return p.stars[tostring(i)] or 0
end

local function startLevel(player, index)
	local p = profiles[player]
	local lv = GameData.LEVELS[index]
	if not lv then return { ok = false, error = "Ese nivel no existe" } end
	if index > 1 and starsOf(p, index - 1) == 0 and not isAdmin(player) then
		return { ok = false, error = "Completa el nivel anterior" }
	end
	despawn(player)
	local slot = freeSlot()
	slots[slot] = player
	local origin = Config.LEVEL_ORIGIN + Vector3.new(0, 0, (slot - 1) * Config.LEVEL_SPACING)
	local built = LevelBuilder.build(lv, origin, levelsFolder, false)
	built.folder.Name = player.Name .. "_nivel" .. index
	local car = spawnCar(player, built.startCF)
	states[player] = { mode = "level", index = index, slot = slot, level = built, car = car, startTime = os.clock(), over = false }
	-- Se envían nombres (no objetos): el cliente espera a que le lleguen con WaitForChild.
	return {
		ok = true, mode = "level", index = index, name = lv.name, hint = lv.hint, par = lv.par,
		carName = car.Name, levelName = built.folder.Name,
		targetCF = built.target.CFrame, targetHW = built.targetHW, targetHL = built.targetHL,
		god = p.god,
	}
end

local function startCity(player)
	despawn(player)
	local cf = city.startCF + Vector3.new(math.random(-3, 3) * S, 0, 0)
	local car = spawnCar(player, cf)
	states[player] = { mode = "city", car = car }
	return { ok = true, mode = "city", carName = car.Name, hint = GameData.CITY.hint }
end

local function levelDone(player, index)
	local st = states[player]
	local p = profiles[player]
	if not st or st.mode ~= "level" or st.index ~= index or st.over then return { ok = false } end
	-- Comprobación en el servidor: el coche tiene que estar de verdad en la plaza.
	local chassis = st.car and st.car.PrimaryPart
	if not chassis then return { ok = false } end
	local spec = GameData.CARS[st.car:GetAttribute("CarKey")]
	local tol = 1.5
	local inside = Physics.parkedIn(chassis.CFrame, spec.w * S / 2 - tol, spec.l * S / 2 - tol, st.level.target.CFrame, st.level.targetHW, st.level.targetHL)
	local elapsed = os.clock() - st.startTime
	if not inside or elapsed < 2 then return { ok = false, error = "No estás aparcado en la plaza" } end
	st.over = true
	local par = GameData.LEVELS[index].par
	local stars = 1
	if elapsed <= par then stars = 3 elseif elapsed <= par * 1.6 then stars = 2 end
	local first = starsOf(p, index) == 0
	local reward = (first and (100 + (index - 1) * 25) or 20) + stars * 20
	p.stars[tostring(index)] = math.max(starsOf(p, index), stars)
	p.coins = p.coins + reward
	changed(player)
	return { ok = true, stars = stars, reward = reward, time = elapsed, hasNext = GameData.LEVELS[index + 1] ~= nil }
end

-- ---------- Monedas de la ciudad ----------
local coinTakenAt = {}
local function collectCoin(player, id)
	local st = states[player]
	local coin = city.coins[id]
	if not st or st.mode ~= "city" or not coin or coinTakenAt[id] then return { ok = false } end
	local chassis = st.car and st.car.PrimaryPart
	if not chassis or (chassis.Position - coin.Position).Magnitude > 4 * S then return { ok = false } end
	coinTakenAt[id] = os.clock()
	coin.Transparency = 1
	coinTaken:FireAllClients(id, true)
	profiles[player].coins = profiles[player].coins + Config.CITY_COIN_VALUE
	changed(player)
	task.delay(Config.COIN_RESPAWN_SECONDS, function()
		coinTakenAt[id] = nil
		coin.Transparency = 0
		coinTaken:FireAllClients(id, false)
	end)
	return { ok = true }
end

-- ---------- Garaje y taller ----------
local function validPart(cat, id)
	local t = GameData.TUNING[cat]
	if not t then return nil end
	for _, o in ipairs(t.options) do
		if o.id == id then return o end
	end
	return nil
end

-- Piezas disponibles en la versión de Roblox (alerones y body kits: próximamente).
local ROBLOX_PARTS = { rims = true, height = true, neon = true }

local actions = {}

function actions.profile(player)
	return publicProfile(player)
end

function actions.play(player, args)
	if args.mode == "city" then return startCity(player) end
	return startLevel(player, tonumber(args.index) or 1)
end

function actions.levelDone(player, args)
	return levelDone(player, tonumber(args.index))
end

function actions.levelFail(player, args)
	local st = states[player]
	if st and st.mode == "level" and not profiles[player].god then st.over = true end
	return { ok = true }
end

function actions.exit(player)
	despawn(player)
	return { ok = true }
end

function actions.buy(player, args)
	local p = profiles[player]
	local car = GameData.CARS[args.car]
	if not car then return { ok = false } end
	if contains(p.owned, args.car) then return { ok = true } end
	if p.coins < car.price then return { ok = false, error = "Te faltan " .. (car.price - p.coins) .. " monedas" } end
	p.coins = p.coins - car.price
	table.insert(p.owned, args.car)
	p.car = args.car
	changed(player)
	return { ok = true }
end

function actions.select(player, args)
	local p = profiles[player]
	if not contains(p.owned, args.car) then return { ok = false } end
	p.car = args.car
	changed(player)
	return { ok = true }
end

function actions.color(player, args)
	if not contains(GameData.COLORS, args.color) then return { ok = false } end
	profiles[player].color = args.color
	changed(player)
	return { ok = true }
end

function actions.part(player, args)
	local p = profiles[player]
	local o = validPart(args.cat, args.id)
	if not o or not ROBLOX_PARTS[args.cat] or not contains(p.owned, args.car) then return { ok = false } end
	local tag = args.car .. ":" .. args.cat .. ":" .. args.id
	if o.price > 0 and not contains(p.parts, tag) then
		if p.coins < o.price then return { ok = false, error = "Te faltan " .. (o.price - p.coins) .. " monedas" } end
		p.coins = p.coins - o.price
		table.insert(p.parts, tag)
	end
	p.tuning[args.car] = p.tuning[args.car] or {}
	p.tuning[args.car][args.cat] = args.id
	changed(player)
	return { ok = true }
end

function actions.admin(player, args)
	if not isAdmin(player) then return { ok = false, error = "No eres administrador" } end
	local p = profiles[player]
	local a = args.action
	if a == "coins" then
		p.coins = math.min(p.coins + math.clamp(tonumber(args.amount) or 0, 0, 1000000), 999999999)
	elseif a == "million" then
		p.coins = 1000000
	elseif a == "cars" then
		p.owned = {}
		for _, k in ipairs(GameData.CAR_ORDER) do table.insert(p.owned, k) end
	elseif a == "parts" then
		p.parts = {}
		for _, k in ipairs(GameData.CAR_ORDER) do
			for cat in pairs(ROBLOX_PARTS) do
				for _, o in ipairs(GameData.TUNING[cat].options) do table.insert(p.parts, k .. ":" .. cat .. ":" .. o.id) end
			end
		end
	elseif a == "levels" then
		for i = 1, #GameData.LEVELS do p.stars[tostring(i)] = 3 end
	elseif a == "god" then
		p.god = not p.god
	elseif a == "reset" then
		local fresh = defaultProfile()
		for k, v in pairs(fresh) do p[k] = v end
	else
		return { ok = false }
	end
	changed(player)
	return { ok = true }
end

-- Límite de peticiones por jugador para evitar abusos.
local lastRequest = {}
request.OnServerInvoke = function(player, action, args)
	if not profiles[player] then return { ok = false, error = "Cargando partida..." } end
	local now = os.clock()
	if lastRequest[player] and now - lastRequest[player] < 0.08 and action ~= "profile" then return { ok = false } end
	lastRequest[player] = now
	local fn = actions[action]
	if type(fn) ~= "function" then return { ok = false } end
	local ok, result = pcall(fn, player, type(args) == "table" and args or {})
	if not ok then
		warn("Error en la acción " .. tostring(action) .. ": " .. tostring(result))
		return { ok = false, error = "Error del servidor" }
	end
	return result
end

-- ---------- Entrada y salida de jugadores ----------
local function onPlayerAdded(player)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local coins = Instance.new("IntValue")
	coins.Name = "Monedas"
	coins.Parent = ls
	ls.Parent = player
	profiles[player] = load(player)
	changed(player)
	player.CharacterAdded:Connect(function(character)
		local hum = character:WaitForChild("Humanoid")
		hum.Died:Connect(function() despawn(player) end)
	end)
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in ipairs(Players:GetPlayers()) do task.spawn(onPlayerAdded, player) end

Players.PlayerRemoving:Connect(function(player)
	despawn(player)
	save(player)
	profiles[player] = nil
	lastRequest[player] = nil
end)

-- Guardado automático cada minuto y al cerrar el servidor.
task.spawn(function()
	while true do
		task.wait(60)
		for player in pairs(profiles) do save(player) end
	end
end)
game:BindToClose(function()
	for player in pairs(profiles) do save(player) end
end)
