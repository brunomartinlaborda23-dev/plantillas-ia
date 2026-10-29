-- Cliente de Parking Pro 3D: interfaz, controles, conducción, cámara y sonido.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("ParkingShared")
local Config = require(Shared:WaitForChild("Config"))
local GameData = require(Shared:WaitForChild("GameData"))
local Physics = require(Shared:WaitForChild("Physics"))
local CarBuilder = require(Shared:WaitForChild("CarBuilder"))
local remotes = ReplicatedStorage:WaitForChild("ParkingRemotes")
local request = remotes:WaitForChild("Request")

local S = Config.SCALE
local clamp = Physics.clamp
local profile = nil

-- ===================== Interfaz =====================
local T = {
	bg = Color3.fromRGB(18, 21, 28), panel = Color3.fromRGB(28, 33, 43), button = Color3.fromRGB(48, 56, 70),
	accent = Color3.fromRGB(255, 180, 0), text = Color3.fromRGB(244, 246, 251), muted = Color3.fromRGB(165, 173, 189),
	ok = Color3.fromRGB(34, 197, 94), bad = Color3.fromRGB(239, 68, 68), dark = Color3.fromRGB(26, 19, 0),
}

local function make(class, props, children)
	local inst = Instance.new(class)
	for k, v in pairs(props or {}) do
		if k ~= "Parent" then inst[k] = v end
	end
	for _, c in ipairs(children or {}) do c.Parent = inst end
	if props and props.Parent then inst.Parent = props.Parent end
	return inst
end

local function round(inst, r)
	make("UICorner", { CornerRadius = UDim.new(0, r or 12), Parent = inst })
	return inst
end

local function label(props)
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or Enum.Font.GothamBold
	props.TextColor3 = props.TextColor3 or T.text
	props.TextSize = props.TextSize or 18
	return make("TextLabel", props)
end

local function button(text, props)
	props = props or {}
	props.Text = text
	props.Font = props.Font or Enum.Font.GothamBlack
	props.TextSize = props.TextSize or 18
	props.TextColor3 = props.TextColor3 or T.text
	props.BackgroundColor3 = props.BackgroundColor3 or T.button
	props.AutoButtonColor = true
	local b = make("TextButton", props)
	round(b, 12)
	make("UIStroke", { Color = Color3.new(1, 1, 1), Transparency = 0.85, Thickness = 2, ApplyStrokeMode = Enum.ApplyStrokeMode.Border, Parent = b })
	return b
end

local function panel(props)
	props.BackgroundColor3 = props.BackgroundColor3 or T.panel
	props.BackgroundTransparency = props.BackgroundTransparency or 0.08
	local f = make("Frame", props)
	round(f, 18)
	return f
end

local gui = make("ScreenGui", { Name = "ParkingUI", ResetOnSpawn = false, ZIndexBehavior = Enum.ZIndexBehavior.Sibling, Parent = player:WaitForChild("PlayerGui") })

local toastLabel = label({ Size = UDim2.fromOffset(420, 44), Position = UDim2.new(0.5, -210, 0.3, 0), BackgroundTransparency = 0.15, BackgroundColor3 = T.panel, TextSize = 20, Visible = false, ZIndex = 50, Parent = gui })
round(toastLabel, 12)
local toastToken = 0
local function toast(msg)
	toastToken = toastToken + 1
	local mine = toastToken
	toastLabel.Text = msg
	toastLabel.Visible = true
	task.delay(1.8, function()
		if toastToken == mine then toastLabel.Visible = false end
	end)
end

local function call(action, args)
	local ok, res = pcall(function() return request:InvokeServer(action, args or {}) end)
	if not ok or type(res) ~= "table" then return { ok = false, error = "Sin conexión con el servidor" } end
	if res.ok == false and res.error then toast(res.error) end
	return res
end

local function formatCoins(n)
	local s = tostring(math.floor(n or 0))
	local out = ""
	while #s > 3 do
		out = "." .. string.sub(s, -3) .. out
		s = string.sub(s, 1, -4)
	end
	return "🪙 " .. s .. out
end

local screens = {}
local function show(name)
	for k, f in pairs(screens) do f.Visible = (k == name) end
end

-- ---------- Menú principal ----------
local menu = panel({ Name = "Menu", Size = UDim2.fromOffset(560, 250), Position = UDim2.new(0.5, -280, 1, -270), Parent = gui })
screens.menu = menu
label({ Text = "PARKING PRO 3D", Size = UDim2.new(1, 0, 0, 60), Position = UDim2.fromOffset(0, 10), Font = Enum.Font.GothamBlack, TextSize = 46, TextColor3 = T.accent, Parent = menu })
label({ Text = "Aparca sin chocar. ¿Eres el mejor conductor?", Size = UDim2.new(1, 0, 0, 24), Position = UDim2.fromOffset(0, 68), TextColor3 = T.muted, TextSize = 16, Font = Enum.Font.Gotham, Parent = menu })
local menuCoins = label({ Text = "", Size = UDim2.new(1, 0, 0, 26), Position = UDim2.fromOffset(0, 96), TextSize = 20, Parent = menu })
local menuRow = make("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, -40, 0, 110), Position = UDim2.fromOffset(20, 130), Parent = menu })
make("UIGridLayout", { CellSize = UDim2.new(0.5, -6, 0, 48), CellPadding = UDim2.fromOffset(12, 10), SortOrder = Enum.SortOrder.LayoutOrder, Parent = menuRow })
local btnLevels = button("▶ Niveles", { LayoutOrder = 1, BackgroundColor3 = T.accent, TextColor3 = T.dark, Parent = menuRow })
local btnCity = button("🏙️ Ciudad libre", { LayoutOrder = 2, Parent = menuRow })
local btnGarage = button("🚗 Garaje", { LayoutOrder = 3, Parent = menuRow })
local btnAdmin = button("🛠️ Admin", { LayoutOrder = 4, Visible = false, Parent = menuRow })

-- ---------- Niveles ----------
local levelsScreen = panel({ Name = "Levels", Size = UDim2.new(0, 760, 0, 420), Position = UDim2.new(0.5, -380, 0.5, -210), Visible = false, Parent = gui })
screens.levels = levelsScreen
label({ Text = "Niveles", Size = UDim2.new(1, 0, 0, 50), TextSize = 30, Font = Enum.Font.GothamBlack, Parent = levelsScreen })
local levelsBack = button("← Volver", { Size = UDim2.fromOffset(120, 40), Position = UDim2.fromOffset(14, 8), TextSize = 16, Parent = levelsScreen })
local levelGrid = make("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, -28, 1, -70), Position = UDim2.fromOffset(14, 60), Parent = levelsScreen })
make("UIGridLayout", { CellSize = UDim2.new(0.2, -10, 0.5, -10), CellPadding = UDim2.fromOffset(12, 12), SortOrder = Enum.SortOrder.LayoutOrder, Parent = levelGrid })

-- ---------- Garaje ----------
local garage = make("Frame", { Name = "Garage", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), Visible = false, Parent = gui })
screens.garage = garage
local viewport = make("ViewportFrame", { Size = UDim2.new(0.55, 0, 0.8, 0), Position = UDim2.new(0.02, 0, 0.1, 0), BackgroundColor3 = T.bg, BackgroundTransparency = 0.1, Ambient = Color3.fromRGB(150, 150, 160), LightColor = Color3.fromRGB(255, 255, 255), LightDirection = Vector3.new(-1, -2, -1), Parent = garage })
round(viewport, 18)
local vpCamera = make("Camera", { FieldOfView = 40, Parent = viewport })
viewport.CurrentCamera = vpCamera
local gPanel = panel({ Size = UDim2.new(0.38, 0, 0.8, 0), Position = UDim2.new(0.6, 0, 0.1, 0), Parent = garage })
local gBack = button("← Volver", { Size = UDim2.fromOffset(110, 36), Position = UDim2.fromOffset(12, 10), TextSize = 15, Parent = gPanel })
local gCoins = label({ Text = "", Size = UDim2.fromOffset(160, 36), Position = UDim2.new(1, -172, 0, 10), TextXAlignment = Enum.TextXAlignment.Right, Parent = gPanel })
local gPrev = button("‹", { Size = UDim2.fromOffset(44, 44), Position = UDim2.fromOffset(12, 56), TextSize = 30, Parent = gPanel })
local gNext = button("›", { Size = UDim2.fromOffset(44, 44), Position = UDim2.new(1, -56, 0, 56), TextSize = 30, Parent = gPanel })
local gName = label({ Text = "", Size = UDim2.new(1, -130, 0, 34), Position = UDim2.fromOffset(65, 54), TextSize = 26, Font = Enum.Font.GothamBlack, Parent = gPanel })
local gSub = label({ Text = "", Size = UDim2.new(1, -130, 0, 20), Position = UDim2.fromOffset(65, 86), TextSize = 13, TextColor3 = T.accent, TextWrapped = true, Parent = gPanel })
local gAction = button("", { Size = UDim2.new(1, -24, 0, 46), Position = UDim2.fromOffset(12, 114), BackgroundColor3 = T.accent, TextColor3 = T.dark, Parent = gPanel })
label({ Text = "Color", Size = UDim2.new(1, -24, 0, 20), Position = UDim2.fromOffset(12, 168), TextSize = 14, TextColor3 = T.muted, TextXAlignment = Enum.TextXAlignment.Left, Parent = gPanel })
local colorRow = make("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, -24, 0, 70), Position = UDim2.fromOffset(12, 190), Parent = gPanel })
make("UIGridLayout", { CellSize = UDim2.fromOffset(30, 30), CellPadding = UDim2.fromOffset(8, 8), Parent = colorRow })
label({ Text = "Taller", Size = UDim2.new(1, -24, 0, 20), Position = UDim2.fromOffset(12, 266), TextSize = 14, TextColor3 = T.muted, TextXAlignment = Enum.TextXAlignment.Left, Parent = gPanel })
local tabRow = make("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, -24, 0, 32), Position = UDim2.fromOffset(12, 288), Parent = gPanel })
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6), Parent = tabRow })
local optGrid = make("ScrollingFrame", { BackgroundTransparency = 1, Size = UDim2.new(1, -24, 1, -332), Position = UDim2.fromOffset(12, 326), ScrollBarThickness = 4, AutomaticCanvasSize = Enum.AutomaticSize.Y, CanvasSize = UDim2.new(), Parent = gPanel })
make("UIGridLayout", { CellSize = UDim2.new(0.5, -5, 0, 44), CellPadding = UDim2.fromOffset(10, 8), SortOrder = Enum.SortOrder.LayoutOrder, Parent = optGrid })

-- ---------- Marcador (HUD) ----------
local hud = make("Frame", { Name = "HUD", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), Visible = false, Parent = gui })
screens.hud = hud
local hudInfo = panel({ Size = UDim2.fromOffset(240, 64), Position = UDim2.fromOffset(12, 12), Parent = hud })
local hudTitle = label({ Text = "", Size = UDim2.new(1, -20, 0, 24), Position = UDim2.fromOffset(10, 6), TextSize = 15, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd, Parent = hudInfo })
local hudTimer = label({ Text = "", Size = UDim2.new(1, -20, 0, 30), Position = UDim2.fromOffset(10, 28), TextSize = 24, Font = Enum.Font.GothamBlack, TextColor3 = T.accent, TextXAlignment = Enum.TextXAlignment.Left, Parent = hudInfo })
local hudHint = label({ Text = "", Size = UDim2.fromOffset(420, 34), Position = UDim2.new(0.5, -210, 0, 14), BackgroundTransparency = 0.15, BackgroundColor3 = T.panel, TextSize = 15, TextWrapped = true, Parent = hud })
round(hudHint, 12)
local btnCam = button("🎥", { Size = UDim2.fromOffset(48, 48), Position = UDim2.new(1, -170, 0, 12), Parent = hud })
local btnExit = button("Salir", { Size = UDim2.fromOffset(100, 48), Position = UDim2.new(1, -112, 0, 12), TextSize = 16, Parent = hud })
local parkBar = make("Frame", { Size = UDim2.fromOffset(200, 12), Position = UDim2.new(0.5, -100, 0, 56), BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.4, Visible = false, Parent = hud })
round(parkBar, 6)
local parkFill = make("Frame", { Size = UDim2.fromScale(0, 1), BackgroundColor3 = T.ok, Parent = parkBar })
round(parkFill, 6)
local speedo = panel({ Size = UDim2.fromOffset(130, 64), Position = UDim2.new(0.5, -65, 1, -78), Parent = hud })
local speedLabel = label({ Text = "0", Size = UDim2.new(1, 0, 0, 36), Position = UDim2.fromOffset(0, 4), TextSize = 32, Font = Enum.Font.GothamBlack, Parent = speedo })
local gearLabel = label({ Text = "km/h · D1", Size = UDim2.new(1, 0, 0, 18), Position = UDim2.fromOffset(0, 40), TextSize = 13, TextColor3 = T.muted, Parent = speedo })

-- Controles táctiles
local touch = { left = false, right = false, gas = false, brake = false, hand = false }
local gear = 1
local gearButton
local function setGear(g)
	gear = g
	if gearButton then
		gearButton.Text = g == 1 and "D" or "R"
		gearButton.BackgroundColor3 = g == 1 and T.button or T.bad
	end
end
local function holdButton(b, key)
	b.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
			touch[key] = true
			b.BackgroundTransparency = 0.1
		end
	end)
	b.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
			touch[key] = false
			b.BackgroundTransparency = 0.35
		end
	end)
end
if UserInputService.TouchEnabled then
	local pedal = function(text, size, pos, key)
		local b = button(text, { Size = size, Position = pos, BackgroundTransparency = 0.35, TextSize = 22, Parent = hud })
		holdButton(b, key)
		return b
	end
	pedal("◀", UDim2.fromOffset(90, 90), UDim2.new(0, 16, 1, -106), "left")
	pedal("▶", UDim2.fromOffset(90, 90), UDim2.new(0, 116, 1, -106), "right")
	pedal("GAS", UDim2.fromOffset(80, 140), UDim2.new(1, -96, 1, -156), "gas")
	pedal("FRENO", UDim2.fromOffset(96, 96), UDim2.new(1, -204, 1, -112), "brake")
	pedal("P", UDim2.fromOffset(60, 60), UDim2.new(1, -274, 1, -76), "hand")
	gearButton = button("D", { Size = UDim2.fromOffset(60, 60), Position = UDim2.new(1, -274, 1, -146), TextSize = 26, Parent = hud })
	gearButton.Activated:Connect(function() setGear(gear == 1 and -1 or 1) end)
end

-- ---------- Ventana de resultado ----------
local modal = make("Frame", { BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.45, Size = UDim2.fromScale(1, 1), Visible = false, ZIndex = 20, Parent = gui })
local card = panel({ Size = UDim2.fromOffset(420, 260), Position = UDim2.new(0.5, -210, 0.5, -130), ZIndex = 21, Parent = modal })
local mTitle = label({ Text = "", Size = UDim2.new(1, 0, 0, 44), Position = UDim2.fromOffset(0, 14), TextSize = 32, Font = Enum.Font.GothamBlack, ZIndex = 22, Parent = card })
local mStars = label({ Text = "", Size = UDim2.new(1, 0, 0, 44), Position = UDim2.fromOffset(0, 58), TextSize = 40, TextColor3 = T.accent, ZIndex = 22, Parent = card })
local mText = label({ Text = "", Size = UDim2.new(1, -30, 0, 50), Position = UDim2.fromOffset(15, 104), TextSize = 17, TextColor3 = T.muted, TextWrapped = true, Font = Enum.Font.Gotham, ZIndex = 22, Parent = card })
local mButtons = make("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, -30, 0, 50), Position = UDim2.new(0, 15, 1, -68), ZIndex = 22, Parent = card })
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, HorizontalAlignment = Enum.HorizontalAlignment.Center, Padding = UDim.new(0, 10), Parent = mButtons })

local function showModal(title, text, stars, buttons)
	mTitle.Text = title
	mText.Text = text
	mStars.Text = stars and (string.rep("★", stars) .. string.rep("☆", 3 - stars)) or ""
	for _, c in ipairs(mButtons:GetChildren()) do
		if c:IsA("GuiButton") then c:Destroy() end
	end
	for i, b in ipairs(buttons) do
		local btn = button(b[1], { Size = UDim2.fromOffset(120, 46), LayoutOrder = i, ZIndex = 23, BackgroundColor3 = b[3] and T.accent or T.button, TextColor3 = b[3] and T.dark or T.text, TextSize = 16, Parent = mButtons })
		btn.Activated:Connect(function()
			modal.Visible = false
			b[2]()
		end)
	end
	modal.Visible = true
end

-- ---------- Panel de admin ----------
local admin = panel({ Size = UDim2.fromOffset(520, 330), Position = UDim2.new(0.5, -260, 0.5, -165), Visible = false, ZIndex = 30, Parent = gui })
label({ Text = "Panel de admin", Size = UDim2.new(1, 0, 0, 44), Position = UDim2.fromOffset(0, 8), TextSize = 28, Font = Enum.Font.GothamBlack, TextColor3 = T.accent, ZIndex = 31, Parent = admin })
local adminStatus = label({ Text = "", Size = UDim2.new(1, 0, 0, 22), Position = UDim2.fromOffset(0, 50), TextSize = 15, TextColor3 = T.muted, ZIndex = 31, Parent = admin })
local adminGrid = make("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, -30, 0, 190), Position = UDim2.fromOffset(15, 80), ZIndex = 31, Parent = admin })
make("UIGridLayout", { CellSize = UDim2.new(0.5, -6, 0, 40), CellPadding = UDim2.fromOffset(12, 8), SortOrder = Enum.SortOrder.LayoutOrder, Parent = adminGrid })
local adminClose = button("Cerrar", { Size = UDim2.fromOffset(140, 40), Position = UDim2.new(0.5, -70, 1, -52), BackgroundColor3 = T.accent, TextColor3 = T.dark, ZIndex = 31, Parent = admin })

-- ===================== Estado y pantallas =====================
local drive = nil
local garageIndex = 1
local tuneCat = "rims"
local ROBLOX_TUNING = { "rims", "height", "neon" }

local function contains(list, v)
	for _, x in ipairs(list or {}) do
		if x == v then return true end
	end
	return false
end

local function starsOf(i)
	return (profile and profile.stars[tostring(i)]) or 0
end

local function refreshCoins()
	if not profile then return end
	menuCoins.Text = formatCoins(profile.coins)
	gCoins.Text = formatCoins(profile.coins)
	btnAdmin.Visible = profile.admin == true
end

local startPlay -- se define más abajo

local function openLevels()
	for _, c in ipairs(levelGrid:GetChildren()) do
		if c:IsA("GuiButton") then c:Destroy() end
	end
	for i, lv in ipairs(GameData.LEVELS) do
		local unlocked = i == 1 or starsOf(i - 1) > 0 or (profile and profile.admin)
		local st = starsOf(i)
		local b = button((unlocked and tostring(i) or "🔒") .. "\n" .. lv.name .. "\n" .. string.rep("★", st) .. string.rep("☆", 3 - st), {
			LayoutOrder = i, TextSize = 15, TextWrapped = true, BackgroundTransparency = unlocked and 0 or 0.5, Parent = levelGrid,
		})
		b.Activated:Connect(function()
			if not unlocked then toast("Completa el nivel anterior") return end
			startPlay({ mode = "level", index = i })
		end)
	end
	show("levels")
end

-- Vista previa del coche en el garaje
local previewModel
local function refreshPreview()
	if previewModel then previewModel:Destroy() end
	local key = GameData.CAR_ORDER[garageIndex]
	local tune = (profile and profile.tuning[key]) or {}
	previewModel = CarBuilder.build(key, { parked = true, color = CarBuilder.hexToColor(profile and profile.color), rims = tune.rims })
	previewModel.Parent = viewport
end

local function renderGarage()
	if not profile then return end
	local key = GameData.CAR_ORDER[garageIndex]
	local spec = GameData.CARS[key]
	gName.Text = spec.name
	gSub.Text = spec.hp .. " CV · 0-100 en " .. string.gsub(tostring(spec.zero100), "%.", ",") .. " s · " .. spec.price .. " monedas"
	local owned = contains(profile.owned, key)
	if profile.car == key then
		gAction.Text = "✓ En uso"
	elseif owned then
		gAction.Text = "Usar este coche"
	else
		gAction.Text = "Comprar · " .. spec.price .. " monedas"
	end
	for _, c in ipairs(colorRow:GetChildren()) do
		if c:IsA("GuiButton") then c:Destroy() end
	end
	for i, hex in ipairs(GameData.COLORS) do
		local sw = make("TextButton", { Text = "", LayoutOrder = i, BackgroundColor3 = CarBuilder.hexToColor(hex), Parent = colorRow })
		round(sw, 15)
		make("UIStroke", { Color = hex == profile.color and Color3.new(1, 1, 1) or Color3.fromRGB(80, 80, 80), Thickness = hex == profile.color and 3 or 1, Parent = sw })
		sw.Activated:Connect(function() call("color", { color = hex }) end)
	end
	-- Taller (solo para coches comprados)
	for _, c in ipairs(tabRow:GetChildren()) do
		if c:IsA("GuiButton") then c:Destroy() end
	end
	for _, c in ipairs(optGrid:GetChildren()) do
		if c:IsA("GuiButton") or c:IsA("TextLabel") then c:Destroy() end
	end
	if not owned then
		label({ Text = "Compra el coche para tunearlo", Size = UDim2.fromOffset(200, 30), TextColor3 = T.muted, TextSize = 14, Parent = optGrid })
	else
		for _, cat in ipairs(ROBLOX_TUNING) do
			local tb = button(GameData.TUNING[cat].label, { Size = UDim2.fromOffset(110, 30), TextSize = 13, BackgroundColor3 = cat == tuneCat and T.accent or T.button, TextColor3 = cat == tuneCat and T.dark or T.text, Parent = tabRow })
			tb.Activated:Connect(function()
				tuneCat = cat
				renderGarage()
			end)
		end
		local current = (profile.tuning[key] or {})[tuneCat] or "stock"
		for i, o in ipairs(GameData.TUNING[tuneCat].options) do
			local has = o.price == 0 or contains(profile.parts, key .. ":" .. tuneCat .. ":" .. o.id)
			local status = (current == o.id) and "Montado" or (has and "Comprado" or (o.price .. " monedas"))
			local ob = button(o.name .. "\n" .. status, { LayoutOrder = i, TextSize = 13, BackgroundColor3 = current == o.id and Color3.fromRGB(70, 60, 20) or T.button, Parent = optGrid })
			ob.Activated:Connect(function() call("part", { car = key, cat = tuneCat, id = o.id }) end)
		end
	end
	refreshCoins()
	refreshPreview()
end

local function openGarage()
	if profile then
		for i, k in ipairs(GameData.CAR_ORDER) do
			if k == profile.car then garageIndex = i end
		end
	end
	renderGarage()
	show("garage")
end

local function renderAdmin()
	if not profile then return end
	adminStatus.Text = formatCoins(profile.coins) .. " · " .. #profile.owned .. "/" .. #GameData.CAR_ORDER .. " coches · sin choques: " .. (profile.god and "SÍ" or "NO")
end

local adminActions = {
	{ "+10.000 monedas", { action = "coins", amount = 10000 } },
	{ "+100.000 monedas", { action = "coins", amount = 100000 } },
	{ "Poner 1.000.000", { action = "million" } },
	{ "Dar todos los coches", { action = "cars" } },
	{ "Dar todas las piezas", { action = "parts" } },
	{ "Niveles con 3 ★", { action = "levels" } },
	{ "Sin choques (sí/no)", { action = "god" } },
	{ "Reiniciar partida", { action = "reset" } },
}
local resetArmed = false
for i, a in ipairs(adminActions) do
	local b = button(a[1], { LayoutOrder = i, TextSize = 15, ZIndex = 32, BackgroundColor3 = a[2].action == "reset" and T.bad or T.button, Parent = adminGrid })
	b.Activated:Connect(function()
		if a[2].action == "reset" and not resetArmed then
			resetArmed = true
			b.Text = "¿Seguro? Toca otra vez"
			task.delay(3, function()
				resetArmed = false
				b.Text = a[1]
			end)
			return
		end
		local res = call("admin", a[2])
		if res.ok then toast("Hecho: " .. a[1]) end
	end)
end
adminClose.Activated:Connect(function() admin.Visible = false end)

-- ===================== Conducción =====================
local playerModule
local function setDefaultControls(enabled)
	if not playerModule then
		local ok, pm = pcall(function() return require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule")) end)
		if ok then playerModule = pm end
	end
	if playerModule then
		local controls = playerModule:GetControls()
		if enabled then controls:Enable() else controls:Disable() end
	end
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if hum then hum:SetStateEnabled(Enum.HumanoidStateType.Jumping, enabled) end
end

local camera = workspace.CurrentCamera
local camMode = 0
local CAM_NAMES = { [0] = "Cámara: detrás", "Cámara: alta", "Cámara: cenital", "Cámara: capó" }

local function stopDriving(goTo)
	if drive then
		if drive.sound then drive.sound:Destroy() end
		drive = nil
	end
	camera.CameraType = Enum.CameraType.Custom
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if hum then camera.CameraSubject = hum end
	setDefaultControls(true)
	call("exit")
	if goTo == "levels" then openLevels() else show("menu") end
end

startPlay = function(args)
	modal.Visible = false
	local res = call("play", args)
	if not res.ok then return end
	local car = workspace:WaitForChild("PlayerCars"):WaitForChild(res.carName, 10)
	if not car then toast("No se pudo cargar el coche") return end
	local chassis = car:WaitForChild("Chassis")
	local key = car:GetAttribute("CarKey")
	local spec = GameData.CARS[key]
	local d = {
		args = args, res = res, car = car, chassis = chassis, hitbox = car:WaitForChild("Hitbox"), key = key, spec = spec,
		c = { v = 0, vl = 0, steer = 0, gear = 1, yaw = 0, slip = 0 },
		dt = { gear = 1, rpm = spec.engine.idle }, steerIn = 0, thr = 0, brk = 0,
		time = 0, inSpot = 0, over = false, spin = {}, motors = {}, heading = 0, camYaw = 0,
	}
	for _, pos in ipairs(CarBuilder.WHEELS) do
		d.motors[pos] = { steer = car:FindFirstChild("Steer_" .. pos, true), spin = car:FindFirstChild("Spin_" .. pos, true) }
		d.spin[pos] = 0
	end
	d.tail, d.rev = {}, {}
	for _, p in ipairs(car:GetDescendants()) do
		local piece = p:IsA("BasePart") and p:GetAttribute("Piece")
		if piece == "Taillights" then table.insert(d.tail, p) end
		if piece == "ReverseLights" then table.insert(d.rev, p) end
	end
	local soundId = Config.SOUND_IDS[spec.engine.voice] or 0
	if soundId ~= 0 then
		d.sound = make("Sound", { SoundId = "rbxassetid://" .. soundId, Looped = true, Volume = 0.5, Parent = chassis })
		d.sound:Play()
	end
	if res.mode == "level" then
		local levelFolder = workspace:WaitForChild("PlayerLevels"):WaitForChild(res.levelName, 10)
		d.obstacles = levelFolder and levelFolder:WaitForChild("Obstacles")
		d.targetPart = levelFolder and levelFolder:FindFirstChild("Target")
		d.overlap = OverlapParams.new()
		d.overlap.FilterType = Enum.RaycastFilterType.Include
		d.overlap.FilterDescendantsInstances = { d.obstacles }
		hudTitle.Text = "Nivel " .. res.index .. " · " .. res.name
		hudHint.Text = (res.god and "Sin choques · " or "") .. res.hint
	else
		hudTitle.Text = "Ciudad libre"
		hudHint.Text = res.hint
	end
	d.heading = math.atan2(chassis.CFrame.LookVector.X, chassis.CFrame.LookVector.Z)
	setGear(1)
	setDefaultControls(false)
	camera.CameraType = Enum.CameraType.Scriptable
	drive = d
	show("hud")
end

local function failLevel(hit)
	local d = drive
	d.over = true
	call("levelFail", { index = d.res.index })
	local what = "Has golpeado un muro."
	local name = hit and hit.Name or ""
	if name == "Cone" then what = "Has derribado un cono."
	elseif name == "Pillar" then what = "Has golpeado una columna."
	elseif name == "Chassis" then what = "Has golpeado un coche aparcado." end
	showModal("¡Has chocado!", what, nil, {
		{ "Reintentar", function() startPlay(d.args) end, true },
		{ "Niveles", function() stopDriving("levels") end },
	})
end

local function completeLevel()
	local d = drive
	d.over = true
	local res = call("levelDone", { index = d.res.index })
	if not res.ok then
		d.over = false
		d.inSpot = 0
		return
	end
	local buttons = {}
	if res.hasNext then table.insert(buttons, { "Siguiente ▶", function() startPlay({ mode = "level", index = d.res.index + 1 }) end, true }) end
	table.insert(buttons, { "Repetir", function() startPlay(d.args) end })
	table.insert(buttons, { "Niveles", function() stopDriving("levels") end })
	showModal("¡Aparcado!", string.format("Tiempo: %.1f s  ·  +%d monedas", res.time, res.reward), res.stars, buttons)
end

-- Lectura de mandos: teclado (marcha automática) o botones táctiles. Pedales progresivos.
local function key(k) return UserInputService:IsKeyDown(k) end
local function readInput(d, dt)
	local typing = UserInputService:GetFocusedTextBox() ~= nil
	local up = not typing and (key(Enum.KeyCode.W) or key(Enum.KeyCode.Up))
	local down = not typing and (key(Enum.KeyCode.S) or key(Enum.KeyCode.Down))
	local left = touch.left or (not typing and (key(Enum.KeyCode.A) or key(Enum.KeyCode.Left)))
	local right = touch.right or (not typing and (key(Enum.KeyCode.D) or key(Enum.KeyCode.Right)))
	local v = d.c.v
	local sp = math.abs(v)
	local kb = (left and 1 or 0) - (right and 1 or 0)
	local reach = 1 / (1 + sp / 9)
	local rate = (kb ~= 0 and 1.75 / (1 + sp / 12) or 1.6) * dt
	d.steerIn = d.steerIn + clamp(kb * reach - d.steerIn, -rate, rate)

	local gas, brk = touch.gas, touch.brake
	if up then
		if gear == 1 then gas = true elseif v < -0.3 then brk = true else setGear(1) gas = true end
	end
	if down then
		if gear == -1 then gas = true elseif v > 0.3 then brk = true else setGear(-1) gas = true end
	end
	d.thr = gas and math.min(1, d.thr + 2.6 * dt) or math.max(0, d.thr - 6 * dt)
	d.brk = brk and math.min(1, d.brk + 4 * dt) or 0
	return { throttle = d.thr, brake = d.brk, steer = d.steerIn, handbrake = touch.hand or (not typing and key(Enum.KeyCode.Space)) }
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed or not drive then return end
	if input.KeyCode == Enum.KeyCode.C then
		camMode = (camMode + 1) % 4
		toast(CAM_NAMES[camMode])
	end
end)

local cityCoins = {}
local coinPending = {}
RunService.Heartbeat:Connect(function(dt)
	local d = drive
	if not d then return end
	local chassis = d.chassis
	if not chassis.Parent then
		drive = nil
		task.spawn(stopDriving)
		return
	end
	local cf = chassis.CFrame
	local look = Vector3.new(cf.LookVector.X, 0, cf.LookVector.Z).Unit
	-- Izquierda del coche (= -RightVector): la física usa + = izquierda, como el giro positivo en Y.
	local left = Vector3.new(look.Z, 0, -look.X)
	local vel = chassis.AssemblyLinearVelocity
	d.c.v = vel:Dot(look) / S
	d.c.vl = vel:Dot(left) / S
	local inp = readInput(d, dt)
	d.c.gear = gear
	if d.over then
		inp.throttle = 0
		inp.handbrake = true
	end
	Physics.step(d.c, inp, d.spec, dt)
	local hv = (look * d.c.v + left * d.c.vl) * S
	chassis.AssemblyLinearVelocity = Vector3.new(hv.X, vel.Y, hv.Z)
	chassis.AssemblyAngularVelocity = Vector3.new(0, d.c.yaw, 0)

	-- Ruedas, luces y motor
	for pos, m in pairs(d.motors) do
		if m.steer and string.sub(pos, 1, 1) == "F" then
			m.steer.C0 = m.steer:GetAttribute("BaseC0") * CFrame.Angles(0, d.c.steer, 0)
		end
		if m.spin then
			d.spin[pos] = d.spin[pos] - d.c.v * dt / d.spec.wheelR
			m.spin.C0 = CFrame.Angles(d.spin[pos], 0, 0)
		end
	end
	for _, p in ipairs(d.tail) do p.Color = d.c.braking and Color3.fromRGB(255, 30, 30) or Color3.fromRGB(120, 0, 0) end
	for _, p in ipairs(d.rev) do p.Material = gear == -1 and Enum.Material.Neon or Enum.Material.SmoothPlastic end
	Physics.drivetrain(d.dt, d.spec.engine, d.c.v, inp.throttle, dt)
	if d.sound then
		d.sound.PlaybackSpeed = clamp(d.dt.rpm / Config.SOUND_BASE_RPM, 0.25, 3.5)
		d.sound.Volume = 0.3 + 0.4 * inp.throttle
	end

	if not d.over then d.time = d.time + dt end
	speedLabel.Text = tostring(math.floor(math.abs(d.c.v) * 3.6 + 0.5))
	gearLabel.Text = "km/h · " .. (gear == -1 and "R" or ("D" .. d.dt.gear))

	if d.res.mode == "level" then
		hudTimer.Text = string.format("%.1f s", d.time)
		-- Roces: cualquier contacto con un obstáculo termina el nivel (salvo modo sin choques).
		if not d.over and not d.res.god and d.obstacles then
			local hits = workspace:GetPartsInPart(d.hitbox, d.overlap)
			if #hits > 0 then failLevel(hits[1]) end
		end
		if not d.over then
			local ok = Physics.parkedIn(cf, d.spec.w * S / 2, d.spec.l * S / 2, d.res.targetCF, d.res.targetHW, d.res.targetHL)
			if ok and math.abs(d.c.v) < 0.15 then d.inSpot = d.inSpot + dt elseif not ok then d.inSpot = 0 end
			parkBar.Visible = ok
			parkFill.Size = UDim2.fromScale(math.min(1, d.inSpot / 1.2), 1)
			if d.targetPart then d.targetPart.Color = ok and Color3.fromRGB(34, 224, 107) or Color3.fromRGB(255, 212, 0) end
			if d.inSpot >= 1.2 then completeLevel() end
		end
	else
		hudTimer.Text = profile and formatCoins(profile.coins) or ""
		parkBar.Visible = false
		-- Monedas de la ciudad
		for id, coin in pairs(cityCoins) do
			if coin.Transparency < 1 and not coinPending[id] and (coin.Position - chassis.Position).Magnitude < 2.5 * S then
				coinPending[id] = true
				task.spawn(function()
					call("collect", { id = id })
					coinPending[id] = nil
				end)
			end
		end
	end
end)

-- Cámara: sigue el rumbo suavizado del coche (como en la versión web).
RunService.RenderStepped:Connect(function(dt)
	for _, coin in pairs(cityCoins) do
		coin.CFrame = coin.CFrame * CFrame.Angles(0, dt * 2, 0)
	end
	if previewModel and screens.garage.Visible then
		local t = os.clock() * 0.4
		local cf, size = previewModel:GetBoundingBox()
		local r = size.Magnitude * 1.1
		vpCamera.CFrame = CFrame.lookAt(cf.Position + Vector3.new(math.sin(t) * r, size.Magnitude * 0.35, math.cos(t) * r), cf.Position)
	end
	local d = drive
	if not d or not d.chassis.Parent then return end
	local cf = d.chassis.CFrame
	local carHeading = math.atan2(cf.LookVector.X, cf.LookVector.Z)
	local diff = math.atan2(math.sin(carHeading - d.heading), math.cos(carHeading - d.heading))
	d.heading = d.heading + diff * math.min(1, dt * 3.5)
	local dir = Vector3.new(math.sin(d.heading), 0, math.cos(d.heading))
	local p = cf.Position
	local camPos, lookAt
	if camMode == 0 then
		camPos = p - dir * 7.5 * S + Vector3.new(0, 3.2 * S, 0)
		lookAt = p + cf.LookVector * 1.5 * S + Vector3.new(0, 0.6 * S, 0)
	elseif camMode == 1 then
		camPos = p - dir * 5 * S + Vector3.new(0, 13 * S, 0)
		lookAt = p + cf.LookVector * 1.5 * S
	elseif camMode == 2 then
		camPos = p + Vector3.new(0, 24 * S, 0) - dir * 0.05
		lookAt = p
	else
		camPos = p + cf.LookVector * 0.3 * S + Vector3.new(0, 0.9 * S, 0)
		lookAt = p + cf.LookVector * 10 * S + Vector3.new(0, 0.6 * S, 0)
	end
	local k = camMode == 3 and 1 or math.min(1, dt * 10)
	camera.CFrame = camera.CFrame:Lerp(CFrame.lookAt(camPos, lookAt), k)
	camera.FieldOfView = 70 + math.min(12, math.abs(d.c.v) * 0.35)
end)

-- ===================== Botones y eventos =====================
btnLevels.Activated:Connect(openLevels)
btnCity.Activated:Connect(function() startPlay({ mode = "city" }) end)
btnGarage.Activated:Connect(openGarage)
btnAdmin.Activated:Connect(function()
	renderAdmin()
	admin.Visible = true
end)
levelsBack.Activated:Connect(function() show("menu") end)
gBack.Activated:Connect(function() show("menu") end)
gPrev.Activated:Connect(function()
	garageIndex = (garageIndex - 2) % #GameData.CAR_ORDER + 1
	renderGarage()
end)
gNext.Activated:Connect(function()
	garageIndex = garageIndex % #GameData.CAR_ORDER + 1
	renderGarage()
end)
gAction.Activated:Connect(function()
	if not profile then return end
	local key = GameData.CAR_ORDER[garageIndex]
	if contains(profile.owned, key) then
		call("select", { car = key })
	else
		local res = call("buy", { car = key })
		if res.ok then toast("¡" .. GameData.CARS[key].name .. " comprado!") end
	end
end)
btnCam.Activated:Connect(function()
	camMode = (camMode + 1) % 4
	toast(CAM_NAMES[camMode])
end)
btnExit.Activated:Connect(function() stopDriving() end)

remotes:WaitForChild("ProfileChanged").OnClientEvent:Connect(function(p)
	profile = p
	refreshCoins()
	if screens.garage.Visible then renderGarage() end
	if admin.Visible then renderAdmin() end
end)

-- Monedas de la ciudad (se construye en el servidor)
task.spawn(function()
	local cityFolder = workspace:WaitForChild("City", 30)
	local coins = cityFolder and cityFolder:WaitForChild("Coins", 30)
	if not coins then return end
	local function add(c)
		local id = c:GetAttribute("CoinId")
		if id then cityCoins[id] = c end
	end
	for _, c in ipairs(coins:GetChildren()) do add(c) end
	coins.ChildAdded:Connect(add)
end)

show("menu")
-- La partida puede tardar un poco en cargarse en el servidor.
while not profile do
	local p = call("profile")
	if p and p.ok ~= false and p.coins then
		profile = p
	else
		task.wait(1)
	end
end
refreshCoins()
