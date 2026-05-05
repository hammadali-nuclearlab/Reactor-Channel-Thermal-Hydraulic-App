program reactor_step
implicit none

integer, parameter :: N = 100
integer :: i, iter, j, max_iter, max_inner

real(8) :: P(N), T(N)
real(8) :: rho(N), mu(N), V(N), Re(N), f(N)
real(8) :: rhom, fm

! SOLID TEMPERATURES
real(8) :: Tco(N), Tci(N), Tfo(N), Tfc(N)

real(8) :: G, Dh, dz, grav, L, A, Perimeter
real(8) :: P3_target, P3calc, errorP3
real(8) :: errorP, errorT

! NODE-BASED THERMAL PROPERTIES
real(8) :: cp(N), Pr(N), Nu(N), k(N), h(N)

real(8) :: cp1, cp2, cpm, H1, H2, lambda

! MATERIAL PROPERTIES
real(8), parameter :: k_clad = 16.0D0
real(8), parameter :: k_fuel = 2.5D0
real(8), parameter :: k_gap  = 0.3D0

real(8), parameter :: t_clad = 0.002D0
real(8), parameter :: t_gap  = 0.0002D0
real(8), parameter :: R_fuel = 0.005D0

real(8) :: A1,A2,A3,A5,A6,A7,A8,A9,A10,A11, dpdr
real(8) :: Q111(N), Q11(N), Q0, z(N), r_ci, r_co, r_fo

external DENSE, viscosity, therm, thercon


! GIVEN

G  = 4058.0D0
Dh = 1.36D-2
grav = 9.81D0

Q0 = 2.0D8                     ! Peak volumetric heat generation (W/m^3)
Perimeter = 0.028D0
A = 9.57D-5

r_fo = R_fuel
r_ci = r_fo + t_gap
r_co = r_ci + t_clad

Q111(1) = 0.0D0                ! Sir I know volumetric heat generation exists everywhere but just i need to have a known starting point to build from: Numerical modeling needs a starting point
Q11(1)  = 0.0D0

L = 3.0D0
dz = L/(N-1)

DO i = 1, N
    z(i) = (i-1)*dz
END DO

P3_target = 15.7D0              ! P3 is my P(N) Outlet Pressure: i just apply it here to have this image of P3 in my head from my previous coding 
T(1) = 564.15D0

max_iter = 100
max_inner = 100

P(1) = 16.0D0                    !Guess Initial Pressure Inlet Condition




! MY FLUID SOLVER


 
DO iter = 1, max_iter           !General Iteration to have correct value of Outlet Pressure and Temperature

    CALL DENSE(P(1), T(1), 1.0D0, rho(1), dpdr)
    rho(1) = rho(1)*1000.0D0

    CALL viscosity(T(1), rho(1)/1000.0D0, mu(1))
    mu(1) = mu(1)*1.0D-6

    V(1) = G / rho(1)
    Re(1) = rho(1)*V(1)*Dh / mu(1) 
    f(1) = 0.184D0 / (Re(1)**0.2D0)

   
    DO i = 2, N                 
        
        
        Q111(i) = Q0 * sin(3.141592653589793D0 * z(i) / L) ! Volumetric heat generation (W/m^3) In Sinosidal Form at each node
        Q11(i)  = Q111(i) * R_fuel / 2.0D0              ! Heat flux  (W/m^2) at each node

        P(i) = P(i-1) - 0.01D0
        T(i) = T(i-1) + 1.0D0

        DO j = 1, max_inner  !Inner Iteration to have correct value of Pressure and Temperature at each node
 
            errorP = P(i)    !To save the previous value of Pressure iteration; for correcting the next one
            errorT = T(i)    !To save the previous value of Temperature; for correcting the next one

            CALL DENSE(P(i), T(i), 0.1D0, rho(i), dpdr)
            rho(i) = rho(i)*1000.0D0

            CALL viscosity(T(i), rho(i)/1000.0D0, mu(i))
            mu(i) = mu(i)*1.0D-6

            V(i) = G / rho(i)
            Re(i) = rho(i)*V(i)*Dh / mu(i)
            f(i) = 0.184D0 / (Re(i)**0.2D0)

            rhom = 0.5D0*(rho(i-1) + rho(i))
            fm   = 0.5D0*(f(i-1) + f(i))
            
            
            

            ! MOMENTUM EQUATION
            P(i) = P(i-1) &
              - (G**2*(1.0D0/rho(i) - 1.0D0/rho(i-1)))/1.0D6 &
              - (G**2*fm*dz/(2.0D0*Dh*rhom))/1.0D6 &
              - (rhom*grav*dz)/1.0D6
            
            
            
            ! ENERGY EQUATION
            CALL therm(T(i-1), rho(i-1)/1000.0D0, A1,A2,A3,cp1,A5,A6,A7,A8,H1,A9,A10,A11)
            CALL therm(T(i),   rho(i)/1000.0D0,   A1,A2,A3,cp2,A5,A6,A7,A8,H2,A9,A10,A11)

            ! Convert Cp from kJ/(kg.K) to J/(kg.K)
            cp1 = cp1 * 1000.0D0
            cp2 = cp2 * 1000.0D0

            cpm = 0.5D0*(cp1 + cp2)

            T(i) = T(i-1) + (Q11(i)*Perimeter*dz)/(cpm*G*A)

            IF (abs(P(i) - errorP) < 1.0D-4 .AND. &
                abs((T(i) - errorT)/errorT) < 1.0D-4) EXIT

        END DO
    END DO

    P3calc = P(N)                                                   ! As i said in Line 62 ! P3 is my P(N)
    errorP3 = abs(P3calc - P3_target)

    print*, "Iter =", iter, "Pout =", P3calc, "Error =", errorP3

    IF (errorP3 < 0.001D0) EXIT

    P(1) = P(1) + (P3_target - P3calc)*0.3D0

END DO






! HEAT TRANSFER

DO i = 1, N

    ! Cp
    CALL therm(T(i), rho(i)/1000.0D0, A1,A2,A3,cp(i),A5,A6,A7,A8,H1,A9,A10,A11)

    ! Convert Cp from kJ/(kg.K) to J/(kg.K)
    cp(i) = cp(i) * 1000.0D0

    ! Thermal conductivity: K
    CALL thercon(T(i), rho(i)/1000.0D0, lambda)
    k(i) = lambda * 1.0D-3

    ! Prandtl Number
    Pr(i) = (cp(i) * mu(i)) / k(i)

    ! Nusselt Number
    Nu(i) = 0.023D0 * (Re(i)**0.8D0) * (Pr(i)**0.4D0)

    ! Heat Transfer Coefficient: h
    h(i) = (Nu(i) * k(i)) / Dh

    ! --- Solid temperatures (Q11 = heat flux) ---
     Tco(i) = T(i) + Q11(i) / h(i)
     
     Tci(i) = Tco(i) + Q11(i) * (r_co / k_clad) * log(r_co / r_ci)

     Tfo(i) = Tci(i) + Q11(i) * (r_ci / k_gap) * log(r_ci / r_fo)

     Tfc(i) = Tfo(i) + (Q111(i) * R_fuel**2) / (4.0D0 * k_fuel)

END DO





!RESULTS

print '(A)', 'i,z,T,P,Q111,Q11,k,h,Tco,Tci,Tfo,Tfc'

DO i = 1, N
      print '(I5,",",F8.4,",",F10.3,",",F10.3,",",E12.4,",",E12.4,",",F10.5,",",F10.3,",",F10.3,",",F10.3,",",F10.3,",",F10.3)', &
      i, z(i), T(i), P(i), Q111(i), Q11(i), k(i), h(i), Tco(i), Tci(i), Tfo(i), Tfc(i)
END DO


pause
end program reactor_step