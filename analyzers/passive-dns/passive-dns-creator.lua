--
-- passive-dns-creator.lua
--
-- TYPE:        BACKEND SCRIPT
-- PURPOSE:     Creates a real time MULTIPURPOSE PASSIVE DNS database 
-- DESCRIPTION: A passive DNS database observes DNS traffic and builds a IP->name
--        and name->IP lookup over time. For NSM purposes an IP->Name mapping is 
--        a crucial capability for real time streaming analytics. 
--
--        This script does the following
--        1. leveldb          - uses LUAJIT FFI to build a LEVELDB backend 
--        2. resource_monitor - listens to DNS and updates the leveldb  CNAME/A -> domain
-- 

package.path = package.path .. ';helpers/?.lua'

local leveldb=require'tris_leveldb'

TrisulPlugin = { 

  id =  {
    name = "Passive DNS",
    description = "Listens to DNS traffic and builds a IP->Name DNS database", 
  },

  -- All those interested in plugging into PDNS listen tothis message and
  -- get a handle to the LevelDB database.  The owner of handle skips it  
  onmessage=function(msgid, msg)
    if msgid=='{4349BFA4-536C-4310-C25E-E7C997B92244}' then
      local dbaddr = msg:match("newleveldb=(%S+)")
	  if not T.LevelDB then 
		  T.LevelDB = leveldb.fromaddr(dbaddr);
	  end
    end
  end,

  -- open the LevelDB database  & create the reader/writer 
  onload = function() 
    T.LevelDB=nil 
  end,

  -- close 
  onunload = function()
      T.loginfo("Closing Leveldb from owner")
      T.LevelDB:close()
  end, 

  -- resource_monitor  block 
  --
  resource_monitor   = {

    -- DNS RESOURCE 
    resource_guid = '{D1E27FF0-6D66-4E57-BB91-99F76BB2143E}',

    --  we will each each DNS resource from Trisul into this method
    --  Engine-0 owns the LevelDB , others share the handle through a broadcast
	--  mechanism. Luckily LevelDB supports N reader/writer per process 
    onnewresource  = function(engine, resource )

      if T.LevelDB == nil then
	  	if engine:instanceid()=="0" then 
          local dbfile = T.env.get_config("App>DBRoot").."/config/PassiveDNSDB.level";
          T.LevelDB = leveldb.open(dbfile); 
          engine:post_message_backend( '{4349BFA4-536C-4310-C25E-E7C997B92244}', "newleveldb="..T.LevelDB:toaddr() ) 
          engine:post_message_frontend('{4349BFA4-536C-4310-C25E-E7C997B92244}', "newleveldb="..T.LevelDB:toaddr() ) 
		else
		  -- other backend engines have to wait .. 
		  return 
	    end
      end

      for ip in  resource:label():gmatch("A%s+([%d%.]+)") do
        T.LevelDB:put(ip,resource:uri())
      end
    end,
  }
}

