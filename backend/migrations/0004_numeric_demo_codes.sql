-- Update only demo Find Codes; preserve stones, journeys and real-stone codes.
UPDATE stones SET demo_code='8451', code_hash='94bcfe105ad50803f9a5dc7f60974e21d47f608826675250c699467f116608dc' WHERE id='A1' AND is_demo=1;
UPDATE stones SET demo_code='8452', code_hash='ecf76566a001ebbfa15cf1c598677b7875acc25ded19c02a7b515cc531e3a6af' WHERE id='B2' AND is_demo=1;
UPDATE stones SET demo_code='8453', code_hash='ed6dea48048cfd0c2ececb0e80c6c3b992165dcac4d45528909d9b53164cd79a' WHERE id='C3' AND is_demo=1;
UPDATE stones SET demo_code='8454', code_hash='c96094ff9f6cb1329c4ff6d35f13f112b291c2ee4505e1fc60b1a00e125d370e' WHERE id='D4' AND is_demo=1;
UPDATE stones SET demo_code='8455', code_hash='575247f7b8346303ef872b6b9f357cf6840b40f090d5e2684971822c42bb81e2' WHERE id='E5' AND is_demo=1;
