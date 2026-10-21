# SPDX-License-Identifier: MIT
import base64
import http.client
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from serve import Server, fetch_camera_frame, validate_camera_config, CameraError

CONFIG=dict(ip='192.168.1.25',port=8080,path='/snapshot.jpg',protocol='http',username='',password='',approved=True)
JPEG=b'\xff\xd8\xff\xe0'+b'frame body'+b'\xff\xd9'

class MockResponse:
    def __init__(self, status=200, mime='image/jpeg', chunks=None):
        self.status=status; self.mime=mime; self.chunks=iter(chunks or [JPEG,b''])
    def getheader(self, name, fallback=''):
        return self.mime if name=='Content-Type' else fallback
    def read1(self,n):return next(self.chunks,b'')

class MockConnection:
    def __init__(self,*args,**kwargs):self.requests=[]
    def request(self,method,path,headers):self.requests.append((method,path,headers))
    def getresponse(self):return MockResponse()
    def close(self):pass

class CameraTests(unittest.TestCase):
    def test_only_private_ip_no_redirect_dangerous_path(self):
        for ip in ['127.0.0.1','8.8.8.8','169.254.1.1','0.0.0.0','192.0.2.30','cam.local','::1']:
            with self.subTest(ip=ip),self.assertRaises(CameraError):
                validate_camera_config({**CONFIG,'ip':ip})
        for path in ['//evil.local','http://evil.local/','/image\nHeader:ok','/foo#fragment']:
            with self.subTest(path=path),self.assertRaises(CameraError):
                validate_camera_config({**CONFIG,'path':path})
        with self.assertRaises(CameraError):validate_camera_config({**CONFIG,'approved':False})
        self.assertEqual(validate_camera_config(CONFIG)[:2],('192.168.1.25',8080))

    def test_snapshot_and_basic_auth(self):
        instances=[]
        def factory(*a,**kw):
            instance=MockConnection(*a,**kw);instances.append(instance);return instance
        with patch('serve.http.client.HTTPConnection',side_effect=factory):
            out=fetch_camera_frame({**CONFIG,'username':'operator','password':'test'})
        self.assertEqual(out,JPEG)
        expected='Basic '+base64.b64encode(b'operator:test').decode()
        self.assertEqual(instances[0].requests[0][2]['Authorization'],expected)

    def test_no_redirect_follow_or_non_jpeg(self):
        for status,mime in [(302,'image/jpeg'),(200,'text/html')]:
            class Fake(MockConnection):
                def getresponse(self):return MockResponse(status,mime)
            with self.subTest(status=status,mime=mime),patch('serve.http.client.HTTPConnection',Fake):
                with self.assertRaises(CameraError):fetch_camera_frame(CONFIG)

    def test_mjpeg_multipart_first_frame(self):
        class Fake(MockConnection):
            def getresponse(self):return MockResponse(mime='multipart/x-mixed-replace;boundary=x',
                    chunks=[b'--x\r\nContent-Type:image/jpeg\r\n\r\n\xff\xd8\xff',b'\xe0DATA\xff\xd9'])
        with patch('serve.http.client.HTTPConnection',Fake):
            self.assertEqual(fetch_camera_frame(CONFIG),b'\xff\xd8\xff\xe0DATA\xff\xd9')

    def test_api_auth_origin_and_response(self):
        s=Server(0);t=threading.Thread(target=s.serve_forever,daemon=True);t.start()
        try:
            def post(headers=None,body=None):
                connection=http.client.HTTPConnection('127.0.0.1',s.server_port,timeout=3)
                body=json.dumps(CONFIG).encode() if body is None else body
                h={'Content-Type':'application/json',**(headers or {})}
                connection.request('POST','/api/ip-camera/frame',body=body,headers=h)
                response=connection.getresponse();status=response.status;result=response.read();connection.close()
                return status,result
            self.assertEqual(post()[0],401)
            self.assertEqual(post({'X-AB-Vision-Session':s.token,'Origin':'http://malicious.example'})[0],403)
            with patch('serve.fetch_camera_frame',return_value=JPEG):
                status,body=post({'X-AB-Vision-Session':s.token})
            self.assertEqual(status,200);self.assertEqual(body,JPEG)
            with patch('serve.fetch_camera_frame',side_effect=CameraError('No autorizado')):
                status,body=post({'X-AB-Vision-Session':s.token},json.dumps({**CONFIG,'approved':False}).encode())
            self.assertEqual(status,400)
        finally:
            s.shutdown();s.server_close();t.join(2)

if __name__=='__main__':unittest.main()
