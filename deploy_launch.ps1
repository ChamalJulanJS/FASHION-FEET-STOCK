Stop-Process -Name "Fashion Feet POS" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Copy-Item -Path "d:\fashionfeet pos\app_packed.asar" -Destination "C:\Users\Dell Latitude 11 Gen\AppData\Local\Programs\Fashion Feet POS\resources\app.asar" -Force
Start-Sleep -Seconds 1
Start-Process "explorer.exe" -ArgumentList '"C:\Users\Dell Latitude 11 Gen\AppData\Local\Programs\Fashion Feet POS\Fashion Feet POS.exe"'
Start-Sleep -Seconds 4
Get-Process -Name "Fashion Feet POS" -ErrorAction SilentlyContinue | Select-Object -Property Id, ProcessName
