pwd > logging-report.txt
echo >> logging-report.txt
echo "grep -in 'console.log' lib/*.js" >> logging-report.txt
grep -in 'console.log' lib/*.js >> logging-report.txt

echo "grep -in 'console.info' lib/*.js" >> logging-report.txt
grep -in 'console.info' lib/*.js >> logging-report.txt

echo >> logging-report.txt
echo "grep -in 'console.warn' lib/*.js" >> logging-report.txt
grep -in 'console.warn' lib/*.js >> log

echo >> logging-report.txt
echo "grep -in 'console.err' lib/*.js" >> logging-report.txt
grep -in 'console.err' lib/*.js >> logging-report.txt

echo >> logging-report.txt
echo "grep -in 'logger' lib/*.js" >> logging-report.txt
grep -in 'logger' lib/*.js >> logging-report.txt


echo "grep -in 'console.log' *.js" >> logging-report.txt
grep -in 'console.log' *.js >> logging-report.txt

echo "grep -in 'console.info' *.js" >> logging-report.txt
grep -in 'console.info' *.js >> logging-report.txt

echo >> logging-report.txt
echo "grep -in 'console.warn' *.js" >> logging-report.txt
grep -in 'console.warn' *.js >> log

echo >> logging-report.txt
echo "grep -in 'console.err' *.js" >> logging-report.txt
grep -in 'console.err' *.js >> logging-report.txt

echo >> logging-report.txt
echo "grep -in 'logger' *.js" >> logging-report.txt
grep -in 'logger' *.js >> logging-report.txt

