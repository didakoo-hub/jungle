// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract JungleReplay {
    function script() external pure returns (string memory) {
        return "<script>"
        "var P=[],D=[document.getElementById('d0'),document.getElementById('d1')],"
        "W=function(q){var r=Math.floor(q/7),c=q%7;return r>2&&r<6&&c!=0&&c!=3&&c!=6},"
        "X=function(s,q){return 'translate('+(q%7)*80+'px,'+Math.floor(q/7)*80+'px) scale(.08)'},"
        "F=function(s){var b=(s<8?0:1)==B;return s%8==0&&b&&W(P[s])?'#99b3e6':(s<8?C[0]:C[1])},"
        "R=function(){for(var s=0;s<16;s++){P[s]=S[s];var e=document.getElementById('p'+s);if(!e)continue;"
        "e.style.transition='none';e.style.display=S[s]<0?'none':'';if(S[s]>=0){e.style.transform=X(s,S[s]);e.setAttribute('fill',F(s))}}"
        "for(var d=0;d<2;d++)if(D[d])D[d].style.display='';i=0;setTimeout(T,600)},"
        "T=function(){if(i>=M.length){setTimeout(R,3000);return}var f=M[i][0],t=M[i][1];i++;"
        "if(f==63){setTimeout(T,200);return}var s=-1,k;for(k=0;k<16;k++)if(P[k]==f)s=k;"
        "if(s<0){setTimeout(T,200);return}var v=-1;for(k=0;k<16;k++)if(P[k]==t)v=k;"
        "var e=document.getElementById('p'+s),j=Math.abs(f-t)>7&&Math.abs(f-t)!=7||Math.abs(f-t)>1&&Math.abs(f-t)<7,ms=j?500:300;"
        "if(v>=0){P[v]=-1;var x=document.getElementById('p'+v);if(x)x.style.display='none'}"
        "if(t==3&&D[0])D[0].style.display='none';if(t==59&&D[1])D[1].style.display='none';"
        "P[s]=t;e.style.transition='transform '+ms+'ms';e.style.transform=X(s,t);"
        "setTimeout(function(){e.setAttribute('fill',F(s));T()},ms)},i=0;"
        "R();"
        "</script>";
    }
}
