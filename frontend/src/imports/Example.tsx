import imgImage1 from "figma:asset/2b7bcd49a5d6e4d3d221d96aae486940c580d50c.png";

function Mask() {
  return (
    <div className="absolute bg-white inset-[-50px]" data-name="Mask">
      <div className="absolute bg-black inset-[76px] rounded-[318px]" data-name="Shape" />
    </div>
  );
}

function Blur1() {
  return <div className="absolute backdrop-blur-[40px] bg-[rgba(0,0,0,0.08)] blur-[20px] inset-[31px_26px_21px_26px] mix-blend-hard-light rounded-[18px]" data-name="Blur" />;
}

function Blur() {
  return (
    <div className="absolute inset-[-26px]" data-name="Blur">
      <Mask />
      <Blur1 />
    </div>
  );
}

function Fill() {
  return (
    <div className="absolute inset-0 rounded-[18px]" data-name="Fill">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-[18px]">
        <div className="absolute bg-[#262626] inset-0 mix-blend-color-dodge rounded-[18px]" />
        <div className="absolute bg-[rgba(245,245,245,0.67)] inset-0 rounded-[18px]" />
      </div>
    </div>
  );
}

function Border() {
  return <div className="absolute bg-white inset-0 mix-blend-multiply rounded-[1000px] shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)]" data-name="Border" />;
}

function Fill1() {
  return <div className="absolute bg-white inset-0 rounded-[1000px]" data-name="Fill" />;
}

function Bg() {
  return (
    <div className="absolute inset-0 rounded-[6px]" data-name="BG">
      <Border />
      <Fill1 />
    </div>
  );
}

function MagnifyingGlass() {
  return (
    <div className="h-[15px] relative shrink-0 w-[16px]" data-name="Magnifying Glass">
      <div className="absolute flex flex-col font-['SF_Pro_Rounded:Medium',sans-serif] inset-0 justify-center leading-[0] not-italic text-[13px] text-black text-center">
        <p className="leading-[15px] whitespace-pre-wrap">􀊫</p>
      </div>
    </div>
  );
}

function Clear() {
  return <div className="h-[15px] shrink-0 w-[16px]" data-name="Clear" />;
}

function SearchField() {
  return (
    <div className="flex-[1_0_0] h-[24px] min-h-px min-w-px relative" data-name="Search Field">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[2px] items-center pl-[8px] pr-[4px] relative size-full">
          <Bg />
          <MagnifyingGlass />
          <p className="flex-[1_0_0] font-['SF_Pro:Medium',sans-serif] font-[510] leading-[16px] min-h-px min-w-px overflow-hidden relative text-[#4c4c4c] text-[13px] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
            Search
          </p>
          <Clear />
        </div>
      </div>
    </div>
  );
}

function Frame12() {
  return (
    <div className="content-stretch flex items-start justify-end relative shrink-0 w-full">
      <SearchField />
    </div>
  );
}

function Tint() {
  return <div className="absolute bg-[#0d6fff] inset-0 opacity-10" data-name="Tint" />;
}

function PushButton() {
  return (
    <div className="content-stretch flex flex-col h-[24px] items-center justify-center overflow-clip px-[16px] relative rounded-[6px] shrink-0" data-name="Push Button">
      <Tint />
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center leading-[0] relative shrink-0 text-[#08f] text-[13px] text-center whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[16px]">View</p>
      </div>
    </div>
  );
}

function Tint1() {
  return <div className="absolute bg-[#0d6fff] inset-0 opacity-10" data-name="Tint" />;
}

function PushButton1() {
  return (
    <div className="content-stretch flex flex-col h-[24px] items-center justify-center overflow-clip px-[16px] relative rounded-[6px] shrink-0" data-name="Push Button">
      <Tint1 />
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center leading-[0] relative shrink-0 text-[#08f] text-[13px] text-center whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[16px]">Ask</p>
      </div>
    </div>
  );
}

function Frame3() {
  return (
    <div className="content-stretch flex gap-[5px] items-start relative shrink-0">
      <PushButton />
      <PushButton1 />
    </div>
  );
}

function Frame2() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[5px] items-end min-h-px min-w-px relative">
      <div className="flex flex-col font-['SF_Pro:Bold',sans-serif] font-bold justify-center leading-[0] min-w-full relative shrink-0 text-[15px] text-black w-[min-content]" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Plot 1</p>
      </div>
      <div className="flex flex-col font-['SF_Pro:Regular',sans-serif] font-normal justify-center leading-[0] min-w-full relative shrink-0 text-[#8e8e93] text-[10px] w-[min-content]" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Columns Used</p>
      </div>
      <Frame3 />
    </div>
  );
}

function Frame() {
  return (
    <div className="bg-white relative rounded-[20px] shrink-0 w-full">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[10px] items-start p-[10px] relative w-full">
          <div className="aspect-[200/200] pointer-events-none relative rounded-[10px] self-stretch shrink-0" data-name="image 1">
            <img alt="" className="absolute inset-0 max-w-none object-cover rounded-[10px] size-full" src={imgImage1} />
            <div aria-hidden="true" className="absolute border border-[rgba(142,142,147,0.1)] border-solid inset-0 rounded-[10px]" />
          </div>
          <Frame2 />
        </div>
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(142,142,147,0.1)] border-solid inset-0 pointer-events-none rounded-[20px]" />
    </div>
  );
}

function Tint2() {
  return <div className="absolute bg-[#0d6fff] inset-0 opacity-10" data-name="Tint" />;
}

function PushButton2() {
  return (
    <div className="content-stretch flex flex-col h-[24px] items-center justify-center overflow-clip px-[16px] relative rounded-[6px] shrink-0" data-name="Push Button">
      <Tint2 />
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center leading-[0] relative shrink-0 text-[#08f] text-[13px] text-center whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[16px]">View</p>
      </div>
    </div>
  );
}

function Tint3() {
  return <div className="absolute bg-[#0d6fff] inset-0 opacity-10" data-name="Tint" />;
}

function PushButton3() {
  return (
    <div className="content-stretch flex flex-col h-[24px] items-center justify-center overflow-clip px-[16px] relative rounded-[6px] shrink-0" data-name="Push Button">
      <Tint3 />
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center leading-[0] relative shrink-0 text-[#08f] text-[13px] text-center whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[16px]">Ask</p>
      </div>
    </div>
  );
}

function Frame6() {
  return (
    <div className="content-stretch flex gap-[5px] items-start relative shrink-0">
      <PushButton2 />
      <PushButton3 />
    </div>
  );
}

function Frame5() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[5px] items-end min-h-px min-w-px relative">
      <div className="flex flex-col font-['SF_Pro:Bold',sans-serif] font-bold justify-center leading-[0] min-w-full relative shrink-0 text-[15px] text-black w-[min-content]" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Plot 1</p>
      </div>
      <div className="flex flex-col font-['SF_Pro:Regular',sans-serif] font-normal justify-center leading-[0] min-w-full relative shrink-0 text-[#8e8e93] text-[10px] w-[min-content]" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Columns Used</p>
      </div>
      <Frame6 />
    </div>
  );
}

function Frame4() {
  return (
    <div className="bg-white relative rounded-[20px] shrink-0 w-full">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[10px] items-start p-[10px] relative w-full">
          <div className="aspect-[200/200] pointer-events-none relative rounded-[10px] self-stretch shrink-0" data-name="image 1">
            <img alt="" className="absolute inset-0 max-w-none object-cover rounded-[10px] size-full" src={imgImage1} />
            <div aria-hidden="true" className="absolute border border-[rgba(142,142,147,0.1)] border-solid inset-0 rounded-[10px]" />
          </div>
          <Frame5 />
        </div>
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(142,142,147,0.1)] border-solid inset-0 pointer-events-none rounded-[20px]" />
    </div>
  );
}

function Frame9() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[5px] items-start leading-[0] min-h-px min-w-px relative">
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center relative shrink-0 text-[13px] text-black w-full" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Summary</p>
      </div>
      <div className="flex flex-col font-['SF_Pro:Regular',sans-serif] font-normal justify-center relative shrink-0 text-[#8e8e93] text-[10px] w-full" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Lorem ipsum dolor sit amet consectetur. Egestas imperdiet in mattis enim elit leo interdum scelerisque.</p>
      </div>
    </div>
  );
}

function Frame10() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[5px] items-start min-h-px min-w-px relative">
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center leading-[0] relative shrink-0 text-[13px] text-black w-full" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Insights</p>
      </div>
      <div className="flex flex-col font-['SF_Pro:Regular',sans-serif] font-normal justify-center leading-[normal] relative shrink-0 text-[#8e8e93] text-[10px] w-full whitespace-pre-wrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="mb-0">Anomalies and istributions</p>
        <p>Dummy vars?</p>
      </div>
    </div>
  );
}

function Frame11() {
  return (
    <div className="content-stretch flex flex-col gap-[5px] items-start leading-[0] relative shrink-0">
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center relative shrink-0 text-[13px] text-black w-full" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Columns</p>
      </div>
      <div className="flex flex-col font-['SF_Pro:Regular',sans-serif] font-normal justify-center relative shrink-0 text-[#8e8e93] text-[10px] w-full" style={{ fontVariationSettings: "'wdth' 100" }}>
        <ul className="list-disc whitespace-pre-wrap">
          <li className="mb-0 ms-[15px]">
            <span className="leading-[normal]">item</span>
          </li>
          <li className="mb-0 ms-[15px]">
            <span className="leading-[normal]">item</span>
          </li>
          <li className="ms-[15px]">
            <span className="leading-[normal]">item</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Frame8() {
  return (
    <div className="content-stretch flex gap-[20px] items-start relative shrink-0 w-full">
      <Frame9 />
      <Frame10 />
      <Frame11 />
    </div>
  );
}

function Tint4() {
  return <div className="absolute bg-[#0d6fff] inset-0 opacity-10" data-name="Tint" />;
}

function PushButton4() {
  return (
    <div className="content-stretch flex flex-col h-[24px] items-center justify-center overflow-clip px-[16px] relative rounded-[6px] shrink-0" data-name="Push Button">
      <Tint4 />
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center leading-[0] relative shrink-0 text-[#08f] text-[13px] text-center whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[16px]">Save PNG</p>
      </div>
    </div>
  );
}

function Tint5() {
  return <div className="absolute bg-[#0d6fff] inset-0 opacity-10" data-name="Tint" />;
}

function PushButton5() {
  return (
    <div className="content-stretch flex flex-col h-[24px] items-center justify-center overflow-clip px-[16px] relative rounded-[6px] shrink-0" data-name="Push Button">
      <Tint5 />
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center leading-[0] relative shrink-0 text-[#08f] text-[13px] text-center whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[16px]">Ask</p>
      </div>
    </div>
  );
}

function Frame13() {
  return (
    <div className="content-stretch flex gap-[5px] items-start relative shrink-0">
      <PushButton4 />
      <PushButton5 />
    </div>
  );
}

function Frame7() {
  return (
    <div className="content-stretch flex flex-col gap-[6px] items-end relative shrink-0 w-full">
      <div className="flex flex-col font-['SF_Pro:Bold',sans-serif] font-bold justify-center leading-[0] min-w-full relative shrink-0 text-[15px] text-black w-[min-content]" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Plot 1</p>
      </div>
      <Frame8 />
      <Frame13 />
    </div>
  );
}

function Frame1() {
  return (
    <div className="bg-white relative rounded-[20px] shrink-0 w-full">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col gap-[10px] items-start px-[20px] py-[10px] relative w-full">
          <div className="aspect-[396/246] pointer-events-none relative rounded-[10px] shrink-0 w-full" data-name="image 1">
            <img alt="" className="absolute inset-0 max-w-none object-cover rounded-[10px] size-full" src={imgImage1} />
            <div aria-hidden="true" className="absolute border border-[rgba(142,142,147,0.1)] border-solid inset-0 rounded-[10px]" />
          </div>
          <Frame7 />
        </div>
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(142,142,147,0.1)] border-solid inset-0 pointer-events-none rounded-[20px]" />
    </div>
  );
}

function Tint6() {
  return <div className="absolute bg-[#0d6fff] inset-0 opacity-10" data-name="Tint" />;
}

function PushButton6() {
  return (
    <div className="content-stretch flex flex-col h-[24px] items-center justify-center overflow-clip px-[16px] relative rounded-[6px] shrink-0" data-name="Push Button">
      <Tint6 />
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center leading-[0] relative shrink-0 text-[#08f] text-[13px] text-center whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[16px]">View</p>
      </div>
    </div>
  );
}

function Tint7() {
  return <div className="absolute bg-[#0d6fff] inset-0 opacity-10" data-name="Tint" />;
}

function PushButton7() {
  return (
    <div className="content-stretch flex flex-col h-[24px] items-center justify-center overflow-clip px-[16px] relative rounded-[6px] shrink-0" data-name="Push Button">
      <Tint7 />
      <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] justify-center leading-[0] relative shrink-0 text-[#08f] text-[13px] text-center whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[16px]">Ask</p>
      </div>
    </div>
  );
}

function Frame16() {
  return (
    <div className="content-stretch flex gap-[5px] items-start relative shrink-0">
      <PushButton6 />
      <PushButton7 />
    </div>
  );
}

function Frame15() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[5px] items-end min-h-px min-w-px relative">
      <div className="flex flex-col font-['SF_Pro:Bold',sans-serif] font-bold justify-center leading-[0] min-w-full relative shrink-0 text-[15px] text-black w-[min-content]" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Plot 1</p>
      </div>
      <div className="flex flex-col font-['SF_Pro:Regular',sans-serif] font-normal justify-center leading-[0] min-w-full relative shrink-0 text-[#8e8e93] text-[10px] w-[min-content]" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] whitespace-pre-wrap">Columns Used</p>
      </div>
      <Frame16 />
    </div>
  );
}

function Frame14() {
  return (
    <div className="bg-white relative rounded-[20px] shrink-0 w-full">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[10px] items-start p-[10px] relative w-full">
          <div className="aspect-[200/200] pointer-events-none relative rounded-[10px] self-stretch shrink-0" data-name="image 1">
            <img alt="" className="absolute inset-0 max-w-none object-cover rounded-[10px] size-full" src={imgImage1} />
            <div aria-hidden="true" className="absolute border border-[rgba(142,142,147,0.1)] border-solid inset-0 rounded-[10px]" />
          </div>
          <Frame15 />
        </div>
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(142,142,147,0.1)] border-solid inset-0 pointer-events-none rounded-[20px]" />
    </div>
  );
}

export default function Example() {
  return (
    <div className="content-stretch flex flex-col gap-[10px] items-start p-[20px] relative size-full" data-name="Example">
      <Blur />
      <Fill />
      <Frame12 />
      <Frame />
      <Frame4 />
      <Frame1 />
      <Frame14 />
    </div>
  );
}