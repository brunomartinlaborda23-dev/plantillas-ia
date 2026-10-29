-- Imitación mínima de la API de Roblox para probar CarBuilder.classify fuera de Roblox.
local V = {}
V.__index = V
local function vec(x, y, z) return setmetatable({ X = x, Y = y, Z = z }, V) end
V.__add = function(a, b) return vec(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
V.__sub = function(a, b) return vec(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
V.__unm = function(a) return vec(-a.X, -a.Y, -a.Z) end
V.__mul = function(a, b) if type(a) == "number" then return vec(a * b.X, a * b.Y, a * b.Z) end if type(b) == "number" then return vec(a.X * b, a.Y * b, a.Z * b) end return vec(a.X * b.X, a.Y * b.Y, a.Z * b.Z) end
V.__div = function(a, b) return vec(a.X / b, a.Y / b, a.Z / b) end
Vector3 = { new = vec }

local C = {}
C.__index = function(t, k) if k == "Position" then return t.p end return C[k] end
local function cf(x, y, z, yaw) return setmetatable({ p = vec(x or 0, y or 0, z or 0), yaw = yaw or 0 }, C) end
C.__mul = function(a, b)
	if getmetatable(b) == V then
		local c, s = math.cos(a.yaw), math.sin(a.yaw)
		return vec(a.p.X + b.X * c + b.Z * s, a.p.Y + b.Y, a.p.Z - b.X * s + b.Z * c)
	end
	return cf(0, 0, 0, a.yaw + b.yaw) -- solo se usa para girar
end
CFrame = { new = cf, Angles = function(_, y, _) return cf(0, 0, 0, y) end }
Color3 = { fromRGB = function(r, g, b) return { R = r / 255, G = g / 255, B = b / 255 } end, new = function(r, g, b) return { R = r, G = g, B = b } end }
Enum = setmetatable({}, { __index = function(_, k) return setmetatable({}, { __index = function(_, v) return k .. "." .. v end }) end })
PhysicalProperties = { new = function() return {} end }
Instance = { new = function(class) return { ClassName = class } end }

-- Piezas y modelos
local Part = {}
Part.__index = function(t, k)
	if k == "Position" then return t.CFrame.p end
	return Part[k]
end
function Part:IsA(c) return c == "BasePart" or c == self.ClassName end
function Part:FindFirstChildOfClass() return nil end
function Part:SetAttribute(k, v) self.attrs = self.attrs or {} self.attrs[k] = v end
function Part:GetAttribute(k) return self.attrs and self.attrs[k] end

local Model = {}
Model.__index = Model
function Model:IsA(c) return c == "Model" end
function Model:GetDescendants() return self.children end
function Model:GetBoundingBox()
	local lo, hi = vec(math.huge, math.huge, math.huge), vec(-math.huge, -math.huge, -math.huge)
	for _, p in ipairs(self.children) do
		local h = p.Size / 2
		local c = p.CFrame.p
		lo = vec(math.min(lo.X, c.X - h.X), math.min(lo.Y, c.Y - h.Y), math.min(lo.Z, c.Z - h.Z))
		hi = vec(math.max(hi.X, c.X + h.X), math.max(hi.Y, c.Y + h.Y), math.max(hi.Z, c.Z + h.Z))
	end
	return cf((lo.X + hi.X) / 2, (lo.Y + hi.Y) / 2, (lo.Z + hi.Z) / 2), hi - lo
end

function MOCK_MODEL(specs)
	local m = setmetatable({ children = {}, Name = "Modelo" }, Model)
	for _, s in ipairs(specs) do
		local p = setmetatable({ ClassName = "MeshPart", Name = s.name, Size = vec(s.size[1], s.size[2], s.size[3]),
			CFrame = cf(s.pos[1], s.pos[2], s.pos[3]), Color = s.color or { R = 0.8, G = 0.1, B = 0.1 }, Transparency = s.transparency or 0, Parent = m }, Part)
		table.insert(m.children, p)
	end
	return m
end

local ReplicatedStorage = { FindFirstChild = function() return nil end }
game = { GetService = function() return ReplicatedStorage end }
