-- Ajustes del juego. Lo que más te interesa cambiar está arriba.
local Config = {}

-- Administradores: el creador del juego ya lo es automáticamente.
-- Para añadir a alguien más, pon su UserId (número que sale en la URL de su perfil de Roblox).
Config.ADMIN_USER_IDS = {
	-- 123456789,
}

-- Sonidos de motor: sube los archivos de roblox/sounds/ a Roblox (Creator Hub > Audio)
-- y pega aquí el número de cada uno. Con 0 el coche no tiene sonido de motor.
Config.SOUND_IDS = {
	i4 = 0,   -- engine_i4.ogg   (Berlina, Compacto)
	v6 = 0,   -- engine_v6.ogg   (Todoterreno)
	v8 = 0,   -- engine_v8.ogg   (Pick-up)
	v6tt = 0, -- engine_v6tt.ogg (Deportivo)
	i6t = 0,  -- engine_i6t.ogg  (Vector CS)
	f6 = 0,   -- engine_f6.ogg   (Strada RS)
	v12 = 0,  -- engine_v12.ogg  (Fulmine HY)
}
Config.SOUND_BASE_RPM = 3000 -- revoluciones a las que se grabaron los bucles

-- Escala: cuántos studs mide un metro del juego.
Config.SCALE = 3

-- Si un coche importado sale mirando hacia atrás, pon 180.
Config.MODEL_YAW_FIX = 0

-- Monedas
Config.START_COINS = 0
Config.CITY_COIN_VALUE = 10
Config.COIN_RESPAWN_SECONDS = 45

-- Partida guardada (cambiar el nombre empieza todas las partidas de cero)
Config.DATASTORE_NAME = "ParkingPro3D_v1"

-- Los niveles de cada jugador se construyen lejos de la ciudad, uno al lado de otro.
Config.LEVEL_ORIGIN = Vector3.new(1600, 0, 0)
Config.LEVEL_SPACING = 320

-- Colores de pinzas y llantas de serie (como en la web)
Config.CALIPER_COLORS = {
	sport = Color3.fromRGB(193, 18, 31), cs = Color3.fromRGB(193, 18, 31),
	rs = Color3.fromRGB(229, 184, 11), hyper = Color3.fromRGB(229, 184, 11),
}
Config.RIM_COLORS = {
	sedan = Color3.fromRGB(196, 200, 206), hatch = Color3.fromRGB(174, 179, 186),
	suv = Color3.fromRGB(158, 163, 170), pickup = Color3.fromRGB(43, 45, 49),
	sport = Color3.fromRGB(141, 147, 155), cs = Color3.fromRGB(138, 109, 59),
	rs = Color3.fromRGB(201, 204, 209), hyper = Color3.fromRGB(30, 31, 34),
}

return Config
