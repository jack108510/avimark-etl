@echo off
net stop AVImarkServer
copy /Y "C:\AVImark\AVImark.db$" "C:\Users\Jackwilde\Projects\avimark-etl\db_copy\AVImark.db$"
copy /Y "C:\AVImark\AVImark.db$-lock" "C:\Users\Jackwilde\Projects\avimark-etl\db_copy\lock.mdb"
net start AVImarkServer
echo DONE > "C:\Users\Jackwilde\Projects\avimark-etl\db_copy\copy_done.flag"
