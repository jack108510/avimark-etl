using System;
using System.Runtime.InteropServices;
using TYPELIBATTR = System.Runtime.InteropServices.ComTypes.TYPELIBATTR;
using TYPEATTR = System.Runtime.InteropServices.ComTypes.TYPEATTR;
using ITypeLib = System.Runtime.InteropServices.ComTypes.ITypeLib;
using ITypeInfo = System.Runtime.InteropServices.ComTypes.ITypeInfo;
using TYPEKIND = System.Runtime.InteropServices.ComTypes.TYPEKIND;

class Program {
    [DllImport("oleaut32.dll", CharSet = CharSet.Unicode)]
    static extern int LoadTypeLib(string szFile, out ITypeLib ppTLib);
    
    [DllImport("oleaut32.dll")]
    static extern int RegisterTypeLib(ITypeLib ptlib, [MarshalAs(UnmanagedType.LPWStr)] string szFullPath, [MarshalAs(UnmanagedType.LPWStr)] string szHelpDir);

    static void Main() {
        Console.WriteLine("=== Loading AVImark COM TypeLib ===");
        ITypeLib tlb;
        int hr = LoadTypeLib(@"C:\AVImark\AVImarkCOMServer.dll", out tlb);
        Console.WriteLine("LoadTypeLib HRESULT: 0x" + hr.ToString("X8"));
        
        if (hr != 0 || tlb == null) {
            Console.WriteLine("FAILED to load typelib");
            return;
        }

        IntPtr pLibAttr;
        tlb.GetLibAttr(out pLibAttr);
        TYPELIBATTR libAttr = (TYPELIBATTR)Marshal.PtrToStructure(pLibAttr, typeof(TYPELIBATTR));
        Console.WriteLine("Library GUID: " + libAttr.guid);
        Console.WriteLine("Library Version: " + libAttr.wMajorVerNum + "." + libAttr.wMinorVerNum);
        tlb.ReleaseTLibAttr(pLibAttr);

        int count = tlb.GetTypeInfoCount();
        Console.WriteLine("Type info count: " + count);
        Console.WriteLine();

        for (int i = 0; i < count; i++) {
            string name, docString, helpFile;
            int helpContext;
            tlb.GetDocumentation(i, out name, out docString, out helpContext, out helpFile);
            
            ITypeInfo typeInfo;
            tlb.GetTypeInfo(i, out typeInfo);
            IntPtr pTypeAttr;
            typeInfo.GetTypeAttr(out pTypeAttr);
            TYPEATTR typeAttr = (TYPEATTR)Marshal.PtrToStructure(pTypeAttr, typeof(TYPEATTR));

            Console.WriteLine("[" + i + "] " + name);
            Console.WriteLine("    GUID: " + typeAttr.guid);
            Console.WriteLine("    Kind: " + (int)typeAttr.typekind);
            Console.WriteLine("    Funcs: " + typeAttr.cFuncs + ", Vars: " + typeAttr.cVars);
            Console.WriteLine("    Desc: " + docString);
            Console.WriteLine();
            
            typeInfo.ReleaseTypeAttr(pTypeAttr);
        }

        Console.WriteLine("=== Registering TypeLib ===");
        hr = RegisterTypeLib(tlb, @"C:\AVImark\AVImarkCOMServer.dll", null);
        Console.WriteLine("RegisterTypeLib HRESULT: 0x" + hr.ToString("X8"));

        Console.WriteLine();
        Console.WriteLine("=== Trying CoClass activation ===");
        for (int i = 0; i < count; i++) {
            ITypeInfo typeInfo;
            tlb.GetTypeInfo(i, out typeInfo);
            IntPtr pTypeAttr;
            typeInfo.GetTypeAttr(out pTypeAttr);
            TYPEATTR typeAttr = (TYPEATTR)Marshal.PtrToStructure(pTypeAttr, typeof(TYPEATTR));
            
            // TKIND_COCLASS = 5
            if ((int)typeAttr.typekind == 5) {
                string name, docString, helpFile;
                int helpContext;
                tlb.GetDocumentation(i, out name, out docString, out helpContext, out helpFile);
                
                Console.Write("  CoClass " + name + " (" + typeAttr.guid + ")... ");
                try {
                    Type t = Type.GetTypeFromCLSID(typeAttr.guid);
                    if (t != null) {
                        object obj = Activator.CreateInstance(t);
                        Console.WriteLine("SUCCESS!");
                    } else {
                        Console.WriteLine("Type is null");
                    }
                } catch (Exception ex) {
                    Console.WriteLine("FAILED: " + ex.InnerException != null ? ex.InnerException.Message : ex.Message);
                }
            }
            typeInfo.ReleaseTypeAttr(pTypeAttr);
        }
    }
}
